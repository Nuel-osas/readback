import React from 'react';
import { Composition } from 'remotion';
import { Film, DURATION } from './Film';
export const RemotionRoot: React.FC = () => <Composition id="Readback" component={Film} durationInFrames={DURATION} fps={30} width={1920} height={1080} />;
