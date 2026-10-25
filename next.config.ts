import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1'],
  outputFileTracingIncludes: {
    '/api/projecao': ['./projecao-final.json'],
    '/api/apuracao': ['./public/data/first-round-2026.json'],
    '/api/ensaio': ['./public/data/first-round-2026.json'],
  },
  outputFileTracingExcludes: {
    '/api/*': ['./dados/originais/**', './dados/pesquisas/**', './dados/local/**'],
  },
};
export default config;
