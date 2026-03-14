import React, { useRef, useEffect, useMemo, useState, memo, useCallback } from 'react';
import {
    View, Text, StyleSheet, Dimensions, Animated,
    PanResponder, TouchableOpacity, Image, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Connection } from '../../services/LocalStorage';
import Svg, { Defs, RadialGradient, LinearGradient, Stop, Circle as SvgCircle, Ellipse } from 'react-native-svg';

const { width, height } = Dimensions.get('window');
const MAP_WIDTH = width * 3;
const MAP_HEIGHT = height * 3;

// ── Pillar 2: Mass Hierarchy constants ────────────────────────────────
const SUN_SIZE = 110;
const MAX_PLANET_SIZE = Math.floor(SUN_SIZE * 0.50); // 55px hard cap
const BASE_NODE_SIZE = 36;
const MEMORY_SIZE_FACTOR = 3;
// ── Pillar 3: Organic Geometry constants ──────────────────────────────
const MIN_ORBIT_RADIUS = 150;
const MAX_ORBIT_RADIUS = 490;
const MAX_MEMORIES_SCALE = 12; // memoryCount at which planet is at closest orbit
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const DEFAULT_ZOOM = 0.85;
const INITIAL_PAN_X = -(MAP_WIDTH - width) / 2;
const INITIAL_PAN_Y = -(MAP_HEIGHT - height) / 2;

// ── Pillar 1: Deterministic PRNG for star positions ──────────────────
function mulberry32(seed: number) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

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

// nodeSize and glowColor remain; orbitFor is no longer needed (Pillar 3 uses polar coords)

function nodeSize(n: number) {
    return Math.min(BASE_NODE_SIZE + n * MEMORY_SIZE_FACTOR, MAX_PLANET_SIZE);
}

function glowColor(emotion: string | null) {
    if (!emotion) return '#8b5cf6';
    const k = emotion.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return EMOTION_GLOW[k] ?? EMOTION_GLOW[emotion.toLowerCase()] ?? '#8b5cf6';
}

function pinchDist(t0: any, t1: any) {
    return Math.hypot(t0.pageX - t1.pageX, t0.pageY - t1.pageY);
}

// ── Planet / Sun Glow ─────────────────────────────────────────────────
let _gid = 0;
const PlanetGlow = memo(({ color, size, isSun }: { color: string; size: number; isSun?: boolean }) => {
    const id = useRef(`g${_gid++}`).current;
    const pulse = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const a = Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: isSun ? 1800 : 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0, duration: isSun ? 1800 : 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]));
        a.start();
        return () => a.stop();
    }, []);
    const cs = size * (isSun ? 5 : 4);
    const half = cs / 2;
    const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [isSun ? 0.6 : 0.5, 1.0] });
    return (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', width: cs, height: cs, opacity }}>
            <Svg width={cs} height={cs}>
                <Defs>
                    <RadialGradient id={id} cx="50%" cy="50%" r="50%">
                        {isSun ? [
                            <Stop key="s1" offset="0%" stopColor={color} stopOpacity="0.7" />,
                            <Stop key="s2" offset="18%" stopColor={color} stopOpacity="1.0" />,
                            <Stop key="s3" offset="28%" stopColor={color} stopOpacity="1.0" />,
                            <Stop key="s4" offset="48%" stopColor={color} stopOpacity="0.55" />,
                            <Stop key="s5" offset="70%" stopColor={color} stopOpacity="0.18" />,
                            <Stop key="s6" offset="88%" stopColor={color} stopOpacity="0.05" />,
                            <Stop key="s7" offset="100%" stopColor={color} stopOpacity="0" />
                        ] : [
                            <Stop key="p1" offset="0%" stopColor={color} stopOpacity="0.6" />,
                            <Stop key="p2" offset="15%" stopColor={color} stopOpacity="0.85" />,
                            <Stop key="p3" offset="25%" stopColor={color} stopOpacity="1.0" />,
                            <Stop key="p4" offset="40%" stopColor={color} stopOpacity="0.5" />,
                            <Stop key="p5" offset="62%" stopColor={color} stopOpacity="0.15" />,
                            <Stop key="p6" offset="82%" stopColor={color} stopOpacity="0.04" />,
                            <Stop key="p7" offset="100%" stopColor={color} stopOpacity="0" />
                        ]}
                    </RadialGradient>
                </Defs>
                <SvgCircle cx={half} cy={half} r={half} fill={`url(#${id})`} />
            </Svg>
        </Animated.View>
    );
});

// ── Zoom Badge ────────────────────────────────────────────────────────
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

// ── Pillar 1: Star Field (rendered inside parallax layer) ─────────────
const StarField = memo(() => {
    const stars = useMemo(() => {
        const rand = mulberry32(7919); // prime seed for stable layout
        return Array.from({ length: 140 }, (_, i) => ({
            key: i,
            x: rand() * MAP_WIDTH,
            y: rand() * MAP_HEIGHT,
            size: 0.8 + rand() * 2.2,
            opacity: 0.12 + rand() * 0.68,
        }));
    }, []);
    return (
        <View style={StyleSheet.absoluteFill}>
            {stars.map(s => (
                <View
                    key={s.key}
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        left: s.x,
                        top: s.y,
                        width: s.size,
                        height: s.size,
                        borderRadius: s.size / 2,
                        backgroundColor: '#ffffff',
                        opacity: s.opacity,
                    }}
                />
            ))}
        </View>
    );
});

// ── Pillar 4: Glass Orb — directional 3D sphere refraction ─────────────
// theta = planet's angle from center. Light (Sun) is at the opposite side.
let _gobid = 0;
const GlassOrb = memo(({ size, theta }: { size: number; theta: number }) => {
    const id = useRef(`orb${_gobid++}`).current;
    // Specular highlight faces the Sun: direction = theta + PI (pointing back to center)
    const lightAngle = theta + Math.PI;

    // Linear gradient coordinates based on light angle
    const x1 = `${50 + 50 * Math.cos(lightAngle)}%`;
    const y1 = `${50 + 50 * Math.sin(lightAngle)}%`;
    const x2 = `${50 - 50 * Math.cos(lightAngle)}%`;
    const y2 = `${50 - 50 * Math.sin(lightAngle)}%`;

    return (
        <Svg
            width={size}
            height={size}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                borderRadius: size / 2,
                overflow: 'hidden',
                // Thin inner border for "glass cut" effect
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.1)'
            }}
            pointerEvents="none"
        >
            <Defs>
                <LinearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
                    <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
                    <Stop offset="30%" stopColor="#ffffff" stopOpacity="0" />
                    <Stop offset="60%" stopColor="#000000" stopOpacity="0" />
                    <Stop offset="100%" stopColor="#000000" stopOpacity="0.8" />
                </LinearGradient>
            </Defs>
            <SvgCircle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
        </Svg>
    );
});

// ── Main Component ────────────────────────────────────────────────────
export default function ConnectionsMap({ connections, metadata, onNodePress, onAddPress }: Props) {
    const panX = useRef(INITIAL_PAN_X);
    const panY = useRef(INITIAL_PAN_Y);
    const zoom = useRef(DEFAULT_ZOOM);
    const panAnim = useRef(new Animated.ValueXY({ x: INITIAL_PAN_X, y: INITIAL_PAN_Y })).current;
    const zoomAnim = useRef(new Animated.Value(DEFAULT_ZOOM)).current;

    // Pillar 1: Parallax = 25% of main pan speed
    const parallaxX = useRef(Animated.multiply(panAnim.x, 0.25)).current;
    const parallaxY = useRef(Animated.multiply(panAnim.y, 0.25)).current;

    const centerX = MAP_WIDTH / 2;
    const centerY = MAP_HEIGHT / 2;
    const sunHalf = SUN_SIZE / 2;

    const isPinching = useRef(false);
    const pinchDist0 = useRef<number | null>(null);
    const pinchCenter = useRef({ x: 0, y: 0 });
    const lastTouch = useRef({ x: 0, y: 0 });
    const lastTap = useRef(0);

    function clamp(x: number, y: number, z: number) {
        const halfW = MAP_WIDTH / 2, halfH = MAP_HEIGHT / 2;
        const minX = width - halfW * (1 + z), maxX = halfW * (z - 1);
        const minY = height - halfH * (1 + z), maxY = halfH * (z - 1);
        return {
            x: minX > maxX ? INITIAL_PAN_X : Math.min(maxX, Math.max(minX, x)),
            y: minY > maxY ? INITIAL_PAN_Y : Math.min(maxY, Math.max(minY, y)),
        };
    }

    const centerMap = useCallback(() => {
        panX.current = INITIAL_PAN_X; panY.current = INITIAL_PAN_Y; zoom.current = DEFAULT_ZOOM;
        Animated.parallel([
            Animated.spring(panAnim, { toValue: { x: INITIAL_PAN_X, y: INITIAL_PAN_Y }, useNativeDriver: false, friction: 7 }),
            Animated.spring(zoomAnim, { toValue: DEFAULT_ZOOM, useNativeDriver: false, friction: 7 }),
        ]).start();
    }, []);

    const responder = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (e, g) =>
            (e.nativeEvent.touches as any[]).length >= 2 || Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
        onMoveShouldSetPanResponderCapture: (e, g) =>
            (e.nativeEvent.touches as any[]).length >= 2 || Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
        onPanResponderGrant: (e) => {
            isPinching.current = false; pinchDist0.current = null;
            const t = (e.nativeEvent.touches as any[])[0];
            lastTouch.current = { x: t?.pageX ?? 0, y: t?.pageY ?? 0 };
        },
        onPanResponderMove: (e) => {
            const touches = e.nativeEvent.touches as any[];
            if (touches.length >= 2) {
                const dist = pinchDist(touches[0], touches[1]);
                if (!isPinching.current) {
                    isPinching.current = true;
                    pinchCenter.current = { x: (touches[0].pageX + touches[1].pageX) / 2, y: (touches[0].pageY + touches[1].pageY) / 2 };
                    pinchDist0.current = dist; return;
                }
                if (pinchDist0.current && pinchDist0.current > 0) {
                    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.current * (dist / pinchDist0.current)));
                    const halfW = MAP_WIDTH / 2, halfH = MAP_HEIGHT / 2;
                    const ratio = newZoom / zoom.current;
                    const { x, y } = clamp(
                        (pinchCenter.current.x - halfW) * (1 - ratio) + panX.current * ratio,
                        (pinchCenter.current.y - halfH) * (1 - ratio) + panY.current * ratio,
                        newZoom
                    );
                    zoom.current = newZoom; panX.current = x; panY.current = y;
                    pinchDist0.current = dist;
                    panAnim.setValue({ x, y }); zoomAnim.setValue(newZoom);
                }
            } else {
                if (isPinching.current) {
                    isPinching.current = false; pinchDist0.current = null;
                    lastTouch.current = { x: touches[0]?.pageX ?? 0, y: touches[0]?.pageY ?? 0 }; return;
                }
                const tx = touches[0]?.pageX ?? 0, ty = touches[0]?.pageY ?? 0;
                const dx = tx - lastTouch.current.x, dy = ty - lastTouch.current.y;
                lastTouch.current = { x: tx, y: ty };
                const { x, y } = clamp(panX.current + dx, panY.current + dy, zoom.current);
                panX.current = x; panY.current = y;
                panAnim.setValue({ x, y });
            }
        },
        onPanResponderRelease: () => { isPinching.current = false; pinchDist0.current = null; },
    })).current;

    const handleMapTap = () => {
        const now = Date.now();
        if (now - lastTap.current < 350) centerMap();
        lastTap.current = now;
    };

    const layout = useMemo(() => {
        const mmap: Record<string, ConnectionMetadata> = {};
        metadata.forEach(m => { mmap[m.connectionId] = m; });

        const total = connections.length || 1;
        const pos: Record<string, { x: number; y: number; size: number; color: string; theta: number }> = {};

        connections.forEach((c, index) => {
            const meta = mmap[c.id];
            const memCount = meta?.memoryCount ?? 0;
            const sz = nodeSize(memCount);

            // Correction 1: Anti-Overlap — Slice-based base angle
            // Divide 360º evenly by total connections, add small organic noise per ID
            const baseAngle = (2 * Math.PI / total) * index;
            const idSeed = c.id.split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0);
            const rand = mulberry32(Math.abs(idSeed));
            const noise = (rand() * 2 - 1) * 0.2; // ±0.2 rad organic deviation
            const theta = baseAngle + noise;

            // Radius inversely proportional to memory count
            const t = Math.min(memCount / MAX_MEMORIES_SCALE, 1.0);
            const baseRadius = MAX_ORBIT_RADIUS - t * (MAX_ORBIT_RADIUS - MIN_ORBIT_RADIUS);
            const variance = baseRadius * 0.05;
            const r = baseRadius + (rand() * 2 - 1) * variance;

            pos[c.id] = {
                x: centerX + Math.cos(theta) * r - sz / 2,
                y: centerY + Math.sin(theta) * r - sz / 2,
                size: sz,
                color: glowColor(meta?.dominantEmotion ?? null),
                theta, // stored for directional GlassOrb lighting
            };
        });
        return pos;
    }, [connections, metadata, centerX, centerY]);

    return (
        <View style={S.container}>
            {/* ── Pillar 1: Deep Space Parallax Star Layer ─────────── */}
            <Animated.View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    width: MAP_WIDTH,
                    height: MAP_HEIGHT,
                    transform: [{ translateX: parallaxX }, { translateY: parallaxY }],
                }}
            >
                <StarField />
            </Animated.View>

            {/* ── Main Constellation Map ────────────────────────────── */}
            <Animated.View
                style={[S.map, { transform: [{ translateX: panAnim.x }, { translateY: panAnim.y }, { scale: zoomAnim }] }]}
                {...responder.panHandlers}
            >
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleMapTap} />

                {/* No more rigid orbit rings in Pillar 3 — organic geometry replaces them */}

                {/* Connection lines */}
                {connections.map(c => {
                    const p = layout[c.id];
                    if (!p) return null;
                    const nx = p.x + p.size / 2, ny = p.y + p.size / 2;
                    const len = Math.hypot(nx - centerX, ny - centerY);
                    const angle = Math.atan2(ny - centerY, nx - centerX) * 180 / Math.PI;
                    return (
                        <View key={`l-${c.id}`} pointerEvents="none" style={{
                            position: 'absolute', left: centerX, top: centerY - 0.5,
                            width: len, height: 1, backgroundColor: p.color, opacity: 0.10,
                            transformOrigin: '0% 50%', transform: [{ rotate: `${angle}deg` }],
                        }} />
                    );
                })}

                {/* ── Pillar 2: Sun — You ───────────────────────────── */}
                <View
                    style={{ position: 'absolute', left: centerX - sunHalf, top: centerY - sunHalf, width: SUN_SIZE, height: SUN_SIZE, alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
                    pointerEvents="none"
                >
                    <PlanetGlow color="#a78bfa" size={SUN_SIZE} isSun={true} />
                    <View style={S.sunCore}>
                        <Ionicons name="person" size={46} color="#fff" />
                    </View>
                </View>
                <Text
                    style={[S.nodeLabel, { left: centerX - 50, top: centerY + sunHalf + 10, textAlign: 'center', width: 100 }]}
                    pointerEvents="none"
                >
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
                                    {/* Pillar 4: Directional Glass Orb — light from Sun */}
                                    <GlassOrb size={p.size} theta={p.theta} />
                                </View>
                                {c.signatureMemoryId && (
                                    <View style={S.badge}>
                                        <Ionicons name="leaf" size={9} color="#fff" />
                                    </View>
                                )}
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
    sunCore: {
        width: SUN_SIZE, height: SUN_SIZE, borderRadius: SUN_SIZE / 2,
        backgroundColor: '#7c3aed',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 3, borderColor: '#c4b5fd',
        shadowColor: '#a78bfa', shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9, shadowRadius: 24, elevation: 14,
    },
    nodeWrapper: { position: 'absolute', alignItems: 'center', zIndex: 5 },
    avatar: {
        backgroundColor: '#12121a', borderWidth: 2,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    badge: {
        position: 'absolute', top: -3, right: -3,
        backgroundColor: '#d97706', width: 18, height: 18, borderRadius: 9,
        alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0a0a0f', zIndex: 10,
    },
    nodeName: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 5, maxWidth: 72 },
    nodeRel: { color: '#9ca3af', fontSize: 9, textAlign: 'center', maxWidth: 72 },
    nodeLabel: { position: 'absolute', color: '#e5e7eb', fontSize: 13, fontWeight: 'bold' },
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
