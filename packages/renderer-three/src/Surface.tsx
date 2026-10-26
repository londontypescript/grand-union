import type { ReactElement, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Container } from '@react-three/uikit';
import { theme } from './theme.ts';

export interface SurfaceProps {
  readonly children: ReactNode;
}

/**
 * The r3f host every `three` registry component draws into: a `Canvas`,
 * camera, lighting, and a bordered uikit panel floating in the scene. The
 * registry stays pure vocabulary (see `registry.ts`) — this is the
 * renderer's stage, not part of it, matching `docs/architecture.md`'s split
 * between a registry and its host.
 *
 * The panel has a visible background and border (see `theme.panel`) so
 * top/middle/bottom placement of `Stack`'s children reads clearly against
 * its boundary, not just against the void of the scene. `OrbitControls` is
 * range-limited rather than free — enough to feel like a 3D scene, not so
 * much that the page can be orbited out of legibility.
 *
 * `gl.preserveDrawingBuffer` is set so a later `tests/render` suite (or a
 * throwaway screenshot script today) can read pixels back from the canvas.
 */
export function Surface({ children }: SurfaceProps): ReactElement {
  return (
    <Canvas
      camera={{ position: [0, 0, 6.5], fov: 45 }}
      gl={{ preserveDrawingBuffer: true }}
      style={{ width: '100vw', height: '100vh', display: 'block' }}
    >
      <color attach="background" args={[theme.color.background]} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 4, 5]} intensity={0.5} />

      <OrbitControls
        enablePan={false}
        enableDamping
        minDistance={5.5}
        maxDistance={8}
        minPolarAngle={Math.PI / 2 - 0.35}
        maxPolarAngle={Math.PI / 2 + 0.35}
        minAzimuthAngle={-0.5}
        maxAzimuthAngle={0.5}
      />

      <Container
        pixelSize={theme.panel.pixelSize}
        width={theme.panel.width}
        height={theme.panel.height}
        backgroundColor={theme.color.panel}
        borderRadius={theme.panel.borderRadius}
        borderWidth={theme.panel.borderWidth}
        borderColor={theme.color.accent}
        overflow="hidden"
      >
        {children}
      </Container>
    </Canvas>
  );
}
