import React from 'react';
import { useControls } from 'leva';

export const SceneBackground: React.FC = () => {
    const { backgroundColor } = useControls({
        backgroundColor: { value: '#ffffff', label: 'Background Color' },
    });

    return <color attach="background" args={[backgroundColor]} />;
};
