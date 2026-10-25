import { verifySnapshot, type Snapshot } from './projection-snapshot';

type JsonObject = Record<string, unknown>;
const CITY_FIELDS = ['id', 'state', 'region', 'electorate', 'flavio', 'lula', 'counts', 'countsInterval', 'countsIntervalResolution', 'intervalResolution'] as const;

export type ProjectionPresentation = Snapshot & {
  representation: 'summary';
  canonicalSha256: string | null;
  integrity: {
    algorithm: 'SHA-256';
    hashScope: 'original-frozen-snapshot';
    appliesToSummary: false;
    originalDownload: string;
    note: string;
  };
};

/** Verify the COMPLETE frozen source before deriving a smaller API view.
 * The original hash is never presented as a checksum of this representation.
 * City counts and their intervals are retained because the comparison UI uses
 * them; model inputs and redundant first-round data remain in the original file.
 */
export function presentProjectionSnapshot(input: unknown): ProjectionPresentation {
  const snapshot = verifySnapshot(input);
  let projection: unknown = snapshot.projection;
  if (projection !== null && projection !== undefined) {
    if (typeof projection !== 'object' || Array.isArray(projection)) throw new Error('Projeção congelada inválida para apresentação.');
    const { input: omittedInput, cities, ...retained } = projection as JsonObject;
    void omittedInput;
    if (!Array.isArray(cities)) throw new Error('Localidades ausentes na projeção congelada.');
    projection = {
      ...retained,
      cities: cities.map((city: unknown) => {
        if (!city || typeof city !== 'object' || Array.isArray(city)) throw new Error('Localidade inválida na projeção congelada.');
        const source = city as JsonObject;
        return Object.fromEntries(CITY_FIELDS.filter(key => Object.hasOwn(source, key)).map(key => [key, source[key]]));
      }),
    };
  }
  return {
    ...snapshot,
    projection,
    representation: 'summary',
    canonicalSha256: snapshot.sha256,
    integrity: {
      algorithm: 'SHA-256',
      hashScope: 'original-frozen-snapshot',
      appliesToSummary: false,
      originalDownload: '/api/projecao?download=1',
      note: 'sha256 e canonicalSha256 identificam o arquivo original completo, com a chave sha256 omitida da serialização canônica. Não são o hash desta representação resumida. Baixe o original para verificar sua integridade.',
    },
  };
}
