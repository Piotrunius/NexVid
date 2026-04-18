import OpenGraphImage from './opengraph-image';

export const runtime = 'edge';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const alt = 'NexVid — Watch Movies and TV Shows Online';

export default function TwitterImage() {
  return OpenGraphImage();
}
