import React, { useRef, useEffect, useMemo, useState, memo } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Image, Easing, Animated as RNAnimated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Connection } from '../../services/LocalStorage';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Circle as SvgCircle, Ellipse } from 'react-native-svg';
import Animated, {
    useSharedValue, useAnimatedStyle, withSpring, withTiming,
    interpolate, Easing as ReAnimatedEasing, useDerivedValue,
    cancelAnimation
} from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';

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

const PLANET_IMAGES = [
    require('../../../assets/images/planets/planet_1.png'),
    require('../../../assets/images/planets/planet_2.png'),
    require('../../../assets/images/planets/planet_3.png'),
    require('../../../assets/images/planets/planet_4.png'),
    require('../../../assets/images/planets/planet_5.png'),
    require('../../../assets/images/planets/planet_6.png'),
    require('../../../assets/images/planets/planet_7.png'),
    require('../../../assets/images/planets/planet_8.png'),
];

const SUN_IMAGE = require('../../../assets/images/sun/sun.png');
const MOON_IMAGE = require('../../../assets/images/Moon/moon.png');

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
    const pulse = useRef(new RNAnimated.Value(0)).current;
    useEffect(() => {
        const a = RNAnimated.loop(RNAnimated.sequence([
            RNAnimated.timing(pulse, { toValue: 1, duration: isSun ? 1800 : 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            RNAnimated.timing(pulse, { toValue: 0, duration: isSun ? 1800 : 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]));
        a.start();
        return () => a.stop();
    }, []);
    const cs = size * (isSun ? 2.2 : 2.0);
    const half = cs / 2;
    const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [isSun ? 0.6 : 0.5, 1.0] });
    return (
        <RNAnimated.View pointerEvents="none" style={{ position: 'absolute', width: cs, height: cs, opacity }}>
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
        </RNAnimated.View>
    );
});

// ── StarField ─────────────────────────────────────────────────────────
const StarField = memo(() => {
    const stars = useMemo(() => {
        const rand = mulberry32(42);
        return Array.from({ length: 140 }, () => ({
            x: rand() * MAP_WIDTH,
            y: rand() * MAP_HEIGHT,
            size: rand() * 2 + 0.5,
            opacity: rand() * 0.7 + 0.2,
            duration: rand() * 3000 + 2000,
        }));
    }, []);

    return (
        <View style={StyleSheet.absoluteFill}>
            {stars.map((s, i) => <Star key={i} {...s} />)}
        </View>
    );
});

const Star = memo(({ x, y, size, opacity, duration }: { x: number, y: number, size: number, opacity: number, duration: number }) => {
    const anim = useRef(new RNAnimated.Value(0)).current;
    useEffect(() => {
        RNAnimated.loop(RNAnimated.sequence([
            RNAnimated.timing(anim, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            RNAnimated.timing(anim, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])).start();
    }, []);

    const op = anim.interpolate({ inputRange: [0, 1], outputRange: [opacity * 0.3, opacity] });

    return (
        <RNAnimated.View
            style={{
                position: 'absolute',
                left: x, top: y,
                width: size, height: size,
                borderRadius: size / 2,
                backgroundColor: '#fff',
                opacity: op,
            }}
        />
    );
});

// ── Pillar 4: Glass Orb — directional 3D sphere refraction ─────────────
// theta = planet's angle from center. Light (Sun) is at the opposite side.
let _gobid = 0;
const GlassOrb = memo(({ size, theta }: { size: number; theta: number }) => {
    const orbId = useRef(`orb${_gobid++}`).current;

    // Specular highlight faces the Sun: direction = theta + PI (pointing back to center)
    const lightAngle = theta + Math.PI;

    // Linear diffuse gradient coordinates
    const sx1 = `${50 + 50 * Math.cos(lightAngle)}%`;
    const sy1 = `${50 + 50 * Math.sin(lightAngle)}%`;
    const sx2 = `${50 - 50 * Math.cos(lightAngle)}%`;
    const sy2 = `${50 - 50 * Math.sin(lightAngle)}%`;

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
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.1)'
            }}
            pointerEvents="none"
        >
            <Defs>
                {/* High Contrast Diffuse Lighting */}
                <LinearGradient id={orbId} x1={sx1} y1={sy1} x2={sx2} y2={sy2}>
                    <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
                    <Stop offset="18%" stopColor="#ffffff" stopOpacity="0" />
                    <Stop offset="68%" stopColor="#000000" stopOpacity="0" />
                    <Stop offset="85%" stopColor="#000000" stopOpacity="0.9" />
                    <Stop offset="100%" stopColor="#000000" stopOpacity="1.0" />
                </LinearGradient>
            </Defs>

            <SvgCircle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${orbId})`} />
        </Svg>
    );
});
// ── Pillar 5: Dynamic Atmosphere ─────────────────────────────────────

// ── Pillar 5: Dynamic Atmosphere Node Wrapper ──────────────────────────
// This component ensures both Moon layers share the same animation clock
const PlanetNode = ({
    connection,
    layout,
    onPress,
    onMoonFront,
    onMoonBack
}: {
    connection: Connection,
    layout: any,
    onPress: (c: Connection) => void,
    onMoonFront: (size: number, id: string, angle: any) => React.ReactNode,
    onMoonBack: (size: number, id: string, angle: any) => React.ReactNode
}) => {
    const angle = useSharedValue(0);
    const p = layout;

    const phaseOffset = useMemo(() => {
        const hash = connection.id.split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0);
        return Math.abs(hash % 1000) / 1000;
    }, [connection.id]);

    useEffect(() => {
        angle.value = phaseOffset;
        angle.value = withTiming(phaseOffset + 1, {
            duration: 7000 + p.size * 45,
            easing: ReAnimatedEasing.linear,
        }, (finished) => {
            if (finished) {
                angle.value = phaseOffset;
                const runLoop = () => {
                    angle.value = withTiming(angle.value + 1, {
                        duration: 7000 + p.size * 45,
                        easing: ReAnimatedEasing.linear,
                    }, (f) => { if (f) runLoop(); });
                };
                runLoop();
            }
        });
        return () => cancelAnimation(angle);
    }, [p.size, phaseOffset, angle]);

    return (
        <TouchableOpacity
            key={connection.id}
            style={[S.nodeWrapper, { left: p.x, top: p.y }]}
            onPress={() => onPress(connection)}
            activeOpacity={0.85}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        >
            <View style={{ width: p.size, height: p.size, alignItems: 'center', justifyContent: 'center' }}>
                {onMoonBack(p.size, connection.id, angle)}

                <View style={[S.avatar, { width: p.size, height: p.size, borderRadius: p.size / 2, zIndex: 10 }]}>
                    {connection.photoUri ? (
                        <Image source={{ uri: connection.photoUri }} style={{ width: '100%', height: '100%' }} />
                    ) : (
                        <Image
                            source={PLANET_IMAGES[Math.abs(connection.id.split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0)) % PLANET_IMAGES.length]}
                            style={{ width: '100%', height: '100%', borderRadius: p.size / 2 }}
                        />
                    )}
                    <GlassOrb size={p.size} theta={p.theta} />
                </View>

                {onMoonFront(p.size, connection.id, angle)}
            </View>
            <Text style={S.nodeName} numberOfLines={1}>{connection.name}</Text>
            <Text style={S.nodeRel} numberOfLines={1}>{connection.relationship}</Text>
        </TouchableOpacity>
    );
};

// Style A: Orbiting Moon Layer (Simplified to rely on parent angle)
const OrbitingMoonLayer = memo(({ size, isFront, angle }: { size: number; isFront: boolean; angle: any }) => {
    const orbitRadius = size * 0.85;
    const moonSize = Math.max(8, size * 0.22);
    const yPersp = 0.35;

    const animatedStyle = useAnimatedStyle(() => {
        const rad = angle.value * Math.PI * 2;
        const tx = Math.cos(rad) * orbitRadius;
        const ty = Math.sin(rad) * orbitRadius * yPersp;

        const sinVal = Math.sin(rad);
        let opacity = 0;
        // Strict depth logic: Y > 0 is front, Y < 0 is back
        if (isFront) {
            opacity = interpolate(sinVal, [-0.05, 0.05], [0, 1], 'clamp');
        } else {
            opacity = interpolate(sinVal, [-0.05, 0.05], [1, 0], 'clamp');
        }

        return {
            transform: [{ translateX: tx }, { translateY: ty }],
            opacity,
            zIndex: isFront ? 20 : -1,
        };
    });

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                { position: 'absolute', width: moonSize, height: moonSize },
                animatedStyle
            ]}
        >
            <Image
                source={MOON_IMAGE}
                style={{ width: '100%', height: '100%', tintColor: isFront ? undefined : 'rgba(0,0,0,0.6)' }}
                resizeMode="contain"
            />
        </Animated.View>
    );
});


// ── Main Component ────────────────────────────────────────────────────
export default function ConnectionsMap({ connections, metadata, onNodePress, onAddPress }: Props) {
    const translateX = useSharedValue(INITIAL_PAN_X);
    const translateY = useSharedValue(INITIAL_PAN_Y);
    const scale = useSharedValue(DEFAULT_ZOOM);

    // Separate contexts for each gesture to prevent collision
    const panStart = useSharedValue({ x: 0, y: 0 });
    const pinchStart = useSharedValue({ x: 0, y: 0, scale: 1, focalX: 0, focalY: 0 });
    const isPinching = useSharedValue(false);

    const panGesture = Gesture.Pan()
        .minDistance(4)
        .onStart(() => {
            // Block pan if pinch is already active
            if (isPinching.value) return;
            panStart.value = { x: translateX.value, y: translateY.value };
        })
        .onUpdate((event) => {
            if (isPinching.value) return;
            translateX.value = panStart.value.x + event.translationX;
            translateY.value = panStart.value.y + event.translationY;
        });

    const pinchGesture = Gesture.Pinch()
        .onStart((event) => {
            isPinching.value = true;
            // Snapshot current state once — never updated during the gesture
            pinchStart.value = {
                x: translateX.value,
                y: translateY.value,
                scale: scale.value,
                focalX: event.focalX,
                focalY: event.focalY,
            };
        })
        .onUpdate((event) => {
            const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchStart.value.scale * event.scale));
            const ratio = newScale / pinchStart.value.scale;

            // Mathematically correct formula for React Native center-origin scale:
            // transform: [translateX, translateY, scale] scales around element center (MAP_WIDTH/2, MAP_HEIGHT/2).
            // newTx = oldTx × ratio + (focalX − MAP_CENTER_X) × (1 − ratio)
            // This ensures the focal point stays fixed in screen space.
            translateX.value = pinchStart.value.x * ratio + (pinchStart.value.focalX - MAP_WIDTH / 2) * (1 - ratio);
            translateY.value = pinchStart.value.y * ratio + (pinchStart.value.focalY - MAP_HEIGHT / 2) * (1 - ratio);
            scale.value = newScale;
        })
        .onEnd(() => { isPinching.value = false; })
        .onFinalize(() => { isPinching.value = false; });

    const combinedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

    const centerX = MAP_WIDTH / 2;
    const centerY = MAP_HEIGHT / 2;
    const sunHalf = SUN_SIZE / 2;

    const animatedMapStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value }
        ]
    }));

    // Parallax: stars move at 30% of the main pan speed, creating depth
    const parallaxStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value * 0.3 },
            { translateY: translateY.value * 0.3 },
            { scale: 0.7 + scale.value * 0.3 },
        ]
    }));

    const lastTap = useRef(0);
    const centerMap = () => {
        translateX.value = withSpring(INITIAL_PAN_X);
        translateY.value = withSpring(INITIAL_PAN_Y);
        scale.value = withSpring(DEFAULT_ZOOM);
    };

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
        <GestureHandlerRootView style={S.container}>
            <GestureDetector gesture={combinedGesture}>
                <View style={S.container}>
                    {/* Parallax Stars - moves at 30% of map, creating depth */}
                    <Animated.View
                        pointerEvents="none"
                        style={[{ position: 'absolute', width: MAP_WIDTH, height: MAP_HEIGHT }, parallaxStyle]}
                    >
                        <StarField />
                    </Animated.View>

                    {/* ── Main Constellation Map ────────────────────────────── */}
                    <Animated.View style={[S.map, animatedMapStyle]}>
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
                            <PlanetGlow color="#fbbf24" size={SUN_SIZE} isSun={true} />
                            <View style={S.sunCore}>
                                <Image source={SUN_IMAGE} style={{ width: SUN_SIZE, height: SUN_SIZE }} resizeMode="contain" />
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
                                <PlanetNode
                                    key={c.id}
                                    connection={c}
                                    layout={p}
                                    onPress={onNodePress}
                                    onMoonBack={(size, id, angle) => (
                                        <OrbitingMoonLayer size={size} isFront={false} angle={angle} />
                                    )}
                                    onMoonFront={(size, id, angle) => (
                                        <OrbitingMoonLayer size={size} isFront={true} angle={angle} />
                                    )}
                                />
                            );
                        })}
                    </Animated.View>

                    {/* HUD */}
                    {/* Note: In Reanimated, ZoomBadge needs a SharedValue. I'll pass a 0-1 derived value */}
                    <ZoomBadgeShared scale={scale} />
                    <TouchableOpacity style={S.centerBtn} onPress={centerMap} activeOpacity={0.8}>
                        <Ionicons name="locate-outline" size={22} color="#a78bfa" />
                    </TouchableOpacity>
                </View>
            </GestureDetector>
        </GestureHandlerRootView>
    );
}

// Optimized ZoomBadge for Reanimated SharedValues
const ZoomBadgeShared = ({ scale }: { scale: any }) => {
    const animatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scale.value, [0.5, 1], [0.5, 1], 'clamp')
    }));
    const zoomPercent = useDerivedValue(() => {
        return Math.round(scale.value * 100);
    });

    // Using a simple state for the display since Reanimated SharedValues are for styling
    // But for a badge, this is fine
    const [display, setDisplay] = useState(100);
    useEffect(() => {
        const interval = setInterval(() => {
            const val = Math.round(scale.value * 100);
            if (val !== display) setDisplay(val);
        }, 100);
        return () => clearInterval(interval);
    }, [display]);

    return (
        <Animated.View style={[S.zoomBadge, animatedStyle]}>
            <Ionicons name="search-outline" size={12} color="#9ca3af" />
            <Text style={S.zoomBadgeText}>{display}%</Text>
        </Animated.View>
    );
};

const S = StyleSheet.create({
    container: { flex: 1, overflow: 'hidden', backgroundColor: '#0a0a0f' },
    map: { width: MAP_WIDTH, height: MAP_HEIGHT },
    sunCore: {
        width: SUN_SIZE, height: SUN_SIZE, borderRadius: SUN_SIZE / 2,
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
    },
    nodeWrapper: { position: 'absolute', alignItems: 'center', zIndex: 5 },
    avatar: {
        backgroundColor: '#12121a',
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
    centerBtn: {
        position: 'absolute', bottom: 25, right: 16,
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
        position: 'absolute', bottom: 32, right: 68,
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(26,26,36,0.85)',
        paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12,
    },
    zoomBadgeText: { color: '#9ca3af', fontSize: 11, fontWeight: '600' },
});
