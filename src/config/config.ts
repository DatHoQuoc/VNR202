export interface AppConfig {
  port: number;
  hostKey: string;
  roomCode: string;
  teams: number;
  dataFile: string | null;
  corsOrigin: string[] | true;
  reflectionMax: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

function randomCode(len = 5): string {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

/** Fail loud: production refuses to start without a host key. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const prod = env.NODE_ENV === 'production';
  let hostKey = env.HOST_KEY ?? '';
  if (!hostKey) {
    if (prod) throw new Error('HOST_KEY is required when NODE_ENV=production');
    hostKey = 'dev-host-key';
    console.warn('[config] HOST_KEY not set, using insecure dev key');
  }
  const teams = Number(env.TEAMS ?? 6);
  if (!Number.isInteger(teams) || teams < 2 || teams > 20) throw new Error(`TEAMS must be an integer in 2..20, got ${env.TEAMS}`);

  const dataFile = env.DATA_FILE === undefined ? './data/game.json' : env.DATA_FILE === '' ? null : env.DATA_FILE;

  return {
    port: Number(env.PORT ?? 3000),
    hostKey,
    roomCode: (env.ROOM_CODE ?? randomCode()).toUpperCase(),
    teams,
    dataFile,
    corsOrigin: env.CORS_ORIGIN ? env.CORS_ORIGIN.split(',').map((s) => s.trim()) : true,
    reflectionMax: Number(env.REFLECTION_MAX ?? 300),
  };
}
