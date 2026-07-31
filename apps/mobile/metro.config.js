// Configuração do Metro para monorepo: o app vive em apps/mobile, mas importa
// @pescavertical/core de packages/core. Sem watchFolders, o Metro não enxerga
// nada fora da própria pasta.
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

module.exports = config;
