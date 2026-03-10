import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

export const VideoMascot = () => {
    return (
        <View style={styles.container} pointerEvents="none">
            {/* Using the perfectly looped WebP version of the original reverse.mp4 */}
            <Image
                source={require('../../assets/reverse_smooth_fixed.webp')}
                style={styles.image}
                contentFit="contain"
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: 250,
        height: 250,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    image: {
        width: 250,
        height: 250,
    }
});
