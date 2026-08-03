// Configuração do Metro para monorepo.
//
// O app vive em apps/mobile mas importa @pescavertical/core de packages/core.
// Sem `watchFolders`, o Metro nem enxerga arquivos fora desta pasta.
//
// Duas armadilhas que já custaram um build quebrado, registradas aqui para não
// voltarem:
//
//   1. `resolver.disableHierarchicalLookup = true` aparece nos exemplos de
//      monorepo do Expo, mas lá existe um node_modules único, içado para a
//      raiz. Aqui cada app tem o seu, e o npm deixa dependências aninhadas em
//      node_modules/expo/node_modules/. Com a busca hierárquica desligada o
//      Metro não alcança essas pastas, e o bundle falha com "Unable to resolve
//      module expo-asset".
//
//   2. `config.experiments = { tsconfigPaths: true }` não existe no Metro — o
//      valor era ignorado, com aviso de validação. Os atalhos `@/*` do tsconfig
//      já funcionam sozinhos: o expo/metro-config lê o tsconfig desde o SDK 50.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projeto = __dirname;
const raiz = path.resolve(projeto, '../..');

const config = getDefaultConfig(projeto);

config.watchFolders = [raiz];

// O pacote local não vive em node_modules nenhum: precisa do caminho explícito.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@pescavertical/core': path.resolve(raiz, 'packages/core/src'),
};

module.exports = config;
