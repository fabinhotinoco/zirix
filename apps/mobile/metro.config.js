// Configuração do Metro para monorepo.
//
// O app vive em apps/mobile mas importa @pescavertical/core de packages/core.
// Duas coisas precisam estar certas, e só a primeira é óbvia:
//
//   1. watchFolders — sem isso o Metro nem enxerga arquivos fora desta pasta.
//   2. resolução dos atalhos de import. O tsconfig `paths` convence o
//      TypeScript, mas o Metro não lê tsconfig sozinho: sem a configuração
//      abaixo, o typecheck passa e o app quebra ao abrir.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projeto = __dirname;
const raiz = path.resolve(projeto, '../..');

const config = getDefaultConfig(projeto);

config.watchFolders = [raiz];
config.resolver.nodeModulesPaths = [
  path.resolve(projeto, 'node_modules'),
  path.resolve(raiz, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

// Faz o Metro honrar os `paths` do tsconfig (@/* e @pescavertical/core/*).
config.experiments = { ...config.experiments, tsconfigPaths: true };

// Rede de segurança, caso o experimento acima mude de nome numa versão futura
// do Expo: o pacote continua resolvendo pelo caminho explícito.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@pescavertical/core': path.resolve(raiz, 'packages/core/src'),
};

module.exports = config;
