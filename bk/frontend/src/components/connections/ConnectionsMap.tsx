import React, { useRef, useEffect, useMemo, useState, memo, useCallback } from 'react';
import {
    View, Text, StyleSheet, Dimensions, Animated,
    PanResponder, TouchableOpacity, Image, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Connection } from '../../services/LocalStorage';
import Svg, { Defs, RadialGradient, Stop, Circle as SvgCircle } from 'react-native-svg';

const { width, height } = Dimensions.get('window');
const MAP_WIDTH = width * 3;
const MAP_HEIGHT = height * 3;
const BASE_NODE_SIZE = 56;
const MAX_NODE_SIZE = 92;
const MEMORY_SIZE_FACTOR = 4;
const ORBIT_RADII = [140, 260, 390, 520];
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const DEFAULT_ZOOM = 0.85;
const INITIAL_PAN_X = -(MAP_WIDTH - width) / 2;
const INITIAL_PAN_Y = -(MAP_HEIGHT - height) / 2;

const EMOTION_GLOW: Record<string, string> = {
    feliz: '#facc15', animado: '#f97316', grato: '#10b981',
    apaixonado: '#f43f5e', calmo: '#3b82f6', tranquilo: '#3b82f6',
    sereno: '#3b82f6', triste: '#6366f1', ansioso: '#a855f7',
    frustrado: '#ef4444', irritado: '#ef4444', nostálgico: '#ec4899',
    esperançoso: '#14b8a6', reflexivo: '#8b5cf6', motivado: '#f59e0b',
    inspirado: '#22d3ee', neutro: '#6b7280', cansado: '#94a3b8',
    happy: '#facc15', sad: '#6366f1', angry: '#ef4444', calm: '#3b82f6',
    anxious: '#a855f7', excited: '#f97316', grateful: '#10b981',
};

export interface ConnectionMetadata {
    connectionId: string;
    memoryCount: number;
    lastInteractionDate: string | null;
    dominantEmotion: string | null;
}

interface Props {
    connections: Connection[];
    metadata: ConnectionMetadata[];
    onNodePress: (c: Connection) => void;
    onAddPress: () => void;
}

function orbitFor(date: string | null) {
    if (!date) return 3;
    const d = (Date.now() - new Date(date).getTime()) / 86400000;
    return d <= 7 ? 0 : d <= 14 ? 1 : d <= 30 ? 2 : 3;
}

function nodeSize(n: number) {
    return Math.min(BASE_NODE_SIZE + n * MEMORY_SIZE_FACTOR, MAX_NODE_SIZE);
}

function glowColor(emotion: string | null) {
    if (!emotion) return '#8b5cf6';
    const k = emotion.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return EMOTION_GLOW[k] ?? EMOTION_GLOW[emotion.toLowerCase()] ?? '#8b5cf6';
}

function pinchDist(t0: any, t1: any) {
    return Math.hypot(t0.pageX - t1.pageX, t0.pageY - t1.pageY);
}

// ── Planet Glow (SVG RadialGradient) ──────────────────────────────
let _gid = 0;
const PlanetGlow = memo(({ color, size }: { color: string; size: number }) => {
    const id = useRef(`g${_gid++}`).current;
    const pulse = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const a = Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]));
        a.start();
        return () => a.stop();
    }, []);

    const cs = size * 4; // corona canvas
    const half = cs / 2;
    const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.0] });

    return (
        <Animated.View
            pointerEvents="none"
            style={{ position: 'absolute', width: cs, height: cs, opacity }}
        >
            <Svg width={cs} height={cs}>
                <Defs>
                    {/* No dark gap: glow peaks at planet edge (~25% radius), fades outward */}
                    <RadialGradient id={id} cx="50%" cy="50%" r="50%">
                        <Stop offset="0%" stopColor={color} stopOpacity="0.6" />
                        <Stop offset="15%" stopColor={color} stopOpacity="0.85" />
                        <Stop offset="25%" stopColor={color} stopOpacity="1.0" />
                        <Stop offset="40%" stopColor={color} stopOpacity="0.5" />
                        <Stop offset="62%" stopColor={color} stopOpacity="0.15" />
                        <Stop offset="82%" stopColor={color} stopOpacity="0.04" />
                        <Stop offset="100%" stopColor={color} stopOpacity="0" />
                    </RadialGradient>
                </Defs>
                <SvgCircle cx={half} cy={half} r={half} fill={`url(#${id})`} />
            </Svg>
        </Animated.View>
    );
});

// ── Zoom Indicator ─────────────────────────────────────────────────
const ZoomBadge = memo(({ anim }: { anim: Animated.Value }) => {
    const [label, setLabel] = useState(`${Math.round(DEFAULT_ZOOM * 100)}%`);
    useEffect(() => {
        const id = anim.addListener(({ value }) => setLabel(`${Math.round(value * 100)}%`));
        return () => anim.removeListener(id);
    }, []);
    return (
        <View style={S.zoomBadge}>
            <Ionicons name="search-outline" size={12} color="#9ca3af" />
            <Text style={S.zoomBadgeText}>{label}</Text>
        </View>
    );
});

// ── Main Component ─────────────────────────────────────────────────
export default function ConnectionsMap({ connections, metadata, onNodePress, onAddPress }: Props) {
    // Ref-based state (no re-render per frame)
    const panX = useRef(INITIAL_PAN_X);
    const panY = useRef(INITIAL_PAN_Y);
    const zoom = useRef(DEFAULT_ZOOM);

    const panAnim = useRef(new Animated.ValueXY({ x: INITIAL_PAN_X, y: INITIAL_PAN_Y })).current;
    const zoomAnim = useRef(new Animated.Value(DEFAULT_ZOOM)).current;

    const centerX = MAP_WIDTH / 2;
    const centerY = MAP_HEIGHT / 2;

    // Gesture refs
    const isPinching = useRef(false);
    const pinchDist0 = useRef<number | null>(null);
    const pinchCenter = useRef({ x: 0, y: 0 });
    const lastTouch = useRef({ x: 0, y: 0 });
    const lastTap = useRef(0);

    // ── Clamp: correct bounds for RN center-based scale ──
    // RN scales around (MAP_WIDTH/2, MAP_HEIGHT/2).
    // Left screen edge = halfW*(1-z) + tx  → must be ≤ 0  → tx ≤ halfW*(z-1)
    // Right screen edge = halfW*(1+z) + tx → must be ≥ width → tx ≥ width - halfW*(1+z)
    function clamp(x: number, y: number, z: number) {
        const halfW = MAP_WIDTH / 2;
        const halfH = MAP_HEIGHT / 2;
        const minX = width - halfW * (1 + z);
        const maxX = halfW * (z - 1);
        const minY = height - halfH * (1 + z);
        const maxY = halfH * (z - 1);
        return {
            x: minX > maxX ? INITIAL_PAN_X : Math.min(maxX, Math.max(minX, x)),
            y: minY > maxY ? INITIAL_PAN_Y : Math.min(maxY, Math.max(minY, y)),
        };
    }

    // ── Center constellation ──
    const centerMap = useCallback(() => {
        panX.current = INITIAL_PAN_X;
        panY.current = INITIAL_PAN_Y;
        zoom.current = DEFAULT_ZOOM;
        Animated.parallel([
            Animated.spring(panAnim, { toValue: { x: INITIAL_PAN_X, y: INITIAL_PAN_Y }, useNativeDriver: false, friction: 7 }),
            Animated.spring(zoomAnim, { toValue: DEFAULT_ZOOM, useNativeDriver: false, friction: 7 }),
        ]).start();
    }, []);

    // ── PanResponder ──
    const responder = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (e, g) =>
            (e.nativeEvent.touches as any[]).length >= 2 || Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
        onMoveShouldSetPanResponderCapture: (e, g) =>
            (e.nativeEvent.touches as any[]).length >= 2 || Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,

        onPanResponderGrant: (e) => {
            isPinching.current = false;
            pinchDist0.current = null;
            const t = (e.nativeEvent.touches as any[])[0];
            lastTouch.current = { x: t?.pageX ?? 0, y: t?.pageY ?? 0 };
        },

        onPanResponderMove: (e) => {
            const touches = e.nativeEvent.touches as any[];

            if (touches.length >= 2) {
                const dist = pinchDist(touches[0], touches[1]);

                if (!isPinching.current) {
                    // First frame of pinch — lock center, establish baseline distance
                    isPinching.current = true;
                    pinchCenter.current = {
                        x: (touches[0].pageX + touches[1].pageX) / 2,
                        y: (touches[0].pageY + touches[1].pageY) / 2,
                    };
                    pinchDist0.current = dist;
                    return;
                }

                if (pinchDist0.current && pinchDist0.current > 0) {
                    const delta = dist / pinchDist0.current;
                    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.current * delta));

                    // ── CORRECT zoom anchor formula for center-based scale ──
                    // React Native scales around (MAP_WIDTH/2, MAP_HEIGHT/2).
                    // For pinch point (pc.x, pc.y) to stay fixed:
                    //   newPanX = (pc.x - halfW) * (1 - ratio) + panX * ratio
                    const halfW = MAP_WIDTH / 2;
                    const halfH = MAP_HEIGHT / 2;
                    const ratio = newZoom / zoom.current;
                    const rawX = (pinchCenter.current.x - halfW) * (1 - ratio) + panX.current * ratio;
                    const rawY = (pinchCenter.current.y - halfH) * (1 - ratio) + panY.current * ratio;
                    const { x, y } = clamp(rawX, rawY, newZoom);

                    zoom.current = newZoom;
                    panX.current = x;
                    panY.current = y;
                    pinchDist0.current = dist; // incremental baseline
                    panAnim.setValue({ x, y });
                    zoomAnim.setValue(newZoom);
                }
            } else {
                // Single finger pan
                if (isPinching.current) {
                    // Transitioning from pinch to single finger — reset tracking
                    isPinching.current = false;
                    pinchDist0.current = null;
                    lastTouch.current = { x: touches[0]?.pageX ?? 0, y: touches[0]?.pageY ?? 0 };
                    return;
                }

                const tx = touches[0]?.pageX ?? 0;
                const ty = touches[0]?.pageY ?? 0;
                const dx = tx - lastTouch.current.x;
                const dy = ty - lastTouch.current.y;
                lastTouch.current = { x: tx, y: ty };

                const { x, y } = clamp(panX.current + dx, panY.current + dy, zoom.current);
                panX.current = x;
                panY.current = y;
                panAnim.setValue({ x, y });
            }
        },

        onPanResponderRelease: () => {
            isPinching.current = false;
            pinchDist0.current = null;
        },
    })).current;

    // ── Double-tap to center ──
    const handleMapTap = () => {
        const now = Date.now();
        if (now - lastTap.current < 350) centerMap();
        lastTap.current = now;
    };

    // ── Node layout (relational physics) ──
    const layout = useMemo(() => {
        const rings: Record<number, string[]> = { 0: [], 1: [], 2: [], 3: [] };
        const mmap: Record<string, ConnectionMetadata> = {};
        metadata.forEach(m => { mmap[m.connectionId] = m; });
        connections.forEach(c => rings[orbitFor(mmap[c.id]?.lastInteractionDate ?? null)].push(c.id));

        const pos: Record<string, { x: number; y: number; size: number; color: string }> = {};
        for (let r = 0; r <= 3; r++) {
            const ids = rings[r];
            if (!ids.length) continue;
            const radius = ORBIT_RADII[r];
            const step = (Math.PI * 2) / ids.length;
            const offset = r * (Math.PI / 5);
            ids.forEach((id, i) => {
                const meta = mmap[id];
                const sz = nodeSize(meta?.memoryCount ?? 0);
                pos[id] = {
                    x: centerX + Math.cos(i * step + offset) * radius - sz / 2,
                    y: centerY + Math.sin(i * step + offset) * radius - sz / 2,
                    size: sz,
                    color: glowColor(meta?.dominantEmotion ?? null),
                };
            });
        }
        return pos;
    }, [connections, metadata, centerX, centerY]);

    return (
        <View style={S.container}>
            <Animated.View
                style={[S.map, { transform: [{ translateX: panAnim.x }, { translateY: panAnim.y }, { scale: zoomAnim }] }]}
                {...responder.panHandlers}
            >
                {/* Background double-tap catcher */}
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleMapTap} />

                {/* Orbit rings */}
                {ORBIT_RADII.map((r, i) => (
                    <View key={i} pointerEvents="none" style={{
                        position: 'absolute', left: centerX - r, top: centerY - r,
                        width: r * 2, height: r * 2, borderRadius: r,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: `rgba(139,92,246,${0.10 + i * 0.025})`,
                    }} />
                ))}

                {/* Connection lines */}
                {connections.map(c => {
                    const p = layout[c.id];
                    if (!p) return null;
                    const nx = p.x + p.size / 2, ny = p.y + p.size / 2;
                    const dx = nx - centerX, dy = ny - centerY;
                    const len = Math.hypot(dx, dy);
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    return (
                        <View key={`l-${c.id}`} pointerEvents="none" style={{
                            position: 'absolute', left: centerX, top: centerY - 0.5,
                            width: len, height: 1, backgroundColor: p.color, opacity: 0.12,
                            transformOrigin: '0% 50%', transform: [{ rotate: `${angle}deg` }],
                        }} />
                    );
                })}

                {/* Center (Você) */}
                <View style={[S.central, { left: centerX - 45, top: centerY - 45 }]} pointerEvents="none">
                    <PlanetGlow color="#8b5cf6" size={90} />
                    <Ionicons name="person" size={42} color="#fff" />
                </View>
                <Text style={[S.nodeLabel, { left: centerX - 50, top: centerY + 54, textAlign: 'center', width: 100 }]} pointerEvents="none">
                    Você
                </Text>

                {/* Planets */}
                {connections.map(c => {
                    const p = layout[c.id];
                    if (!p) return null;
                    return (
                        <TouchableOpacity
                            key={c.id}
                            style={[S.nodeWrapper, { left: p.x, top: p.y }]}
                            onPress={() => onNodePress(c)}
                            activeOpacity={0.85}
                            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                        >
                            <View style={{ width: p.size, height: p.size, alignItems: 'center', justifyContent: 'center' }}>
                                <PlanetGlow color={p.color} size={p.size} />
                                <View style={[S.avatar, { width: p.size, height: p.size, borderRadius: p.size / 2, borderColor: p.color }]}>
                                    {c.photoUri
                                        ? <Image source={{ uri: c.photoUri }} style={{ width: '100%', height: '100%' }} />
                                        : <Ionicons name="person" size={p.size * 0.48} color={p.color} />
                                    }
                                    {c.signatureMemoryId && (
                                        <View style={S.badge}>
                                            <Ionicons name="leaf" size={9} color="#fff" />
                                        </View>
                                    )}
                                </View>
                            </View>
                            <Text style={S.nodeName} numberOfLines={1}>{c.name}</Text>
                            <Text style={S.nodeRel} numberOfLines={1}>{c.relationship}</Text>
                        </TouchableOpacity>
                    );
                })}
            </Animated.View>

            {/* HUD */}
            <ZoomBadge anim={zoomAnim} />

            <TouchableOpacity style={S.centerBtn} onPress={centerMap} activeOpacity={0.8}>
                <Ionicons name="locate-outline" size={22} color="#a78bfa" />
            </TouchableOpacity>

            <TouchableOpacity style={S.fab} onPress={onAddPress} activeOpacity={0.85}>
                <Ionicons name="add" size={32} color="#fff" />
            </TouchableOpacity>

            <View style={S.tooltip} pointerEvents="none">
                <Ionicons name="hand-left-outline" size={14} color="#d1d5db" />
                <Text style={S.tooltipText}>Arraste  ·  Pinça para zoom  ·  2× para centrar</Text>
            </View>
        </View>
    );
}

const S = StyleSheet.create({
    container: { flex: 1, overflow: 'hidden', backgroundColor: '#0a0a0f' },
    map: { width: MAP_WIDTH, height: MAP_HEIGHT },
    central: {
        position: 'absolute', width: 90, height: 90, borderRadius: 45,
        backgroundColor: '#8b5cf6', alignItems: 'center', justifyContent: 'center', zIndex: 10,
    },
    nodeWrapper: { position: 'absolute', alignItems: 'center', zIndex: 5 },
    avatar: {
        backgroundColor: '#12121a', borderWidth: 2,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    badge: {
        position: 'absolute', bottom: -2, right: -2,
        backgroundColor: '#d97706', width: 18, height: 18, borderRadius: 9,
        alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0a0a0f',
    },
    nodeName: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 6, maxWidth: 80 },
    nodeRel: { color: '#9ca3af', fontSize: 10, textAlign: 'center', maxWidth: 80 },
    nodeLabel: { position: 'absolute', color: '#e5e7eb', fontSize: 14, fontWeight: 'bold' },
    fab: {
        position: 'absolute', bottom: 30, right: 30,
        width: 60, height: 60, borderRadius: 30, backgroundColor: '#8b5cf6',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.55, shadowRadius: 10, elevation: 8,
    },
    centerBtn: {
        position: 'absolute', bottom: 104, right: 36,
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'rgba(26,26,36,0.92)',
        borderWidth: 1, borderColor: 'rgba(139,92,246,0.4)',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
    },
    tooltip: {
        position: 'absolute', top: 16, alignSelf: 'center',
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(26,26,36,0.85)',
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, gap: 6,
    },
    tooltipText: { color: '#d1d5db', fontSize: 11 },
    zoomBadge: {
        position: 'absolute', bottom: 156, right: 38,
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(26,26,36,0.85)',
        paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12,
    },
    zoomBadgeText: { color: '#9ca3af', fontSize: 11, fontWeight: '600' },
});
