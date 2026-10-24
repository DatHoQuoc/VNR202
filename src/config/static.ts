import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

/** `public/` sits at the repo root: one level above both `src/` (ts-node) and `dist/` (compiled). */
export const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

export function serveStatic(app: NestExpressApplication): void {
  app.useStaticAssets(PUBLIC_DIR);
}
