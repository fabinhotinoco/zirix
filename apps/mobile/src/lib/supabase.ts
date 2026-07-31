/**
 * Cliente Supabase do aplicativo.
 *
 * Usa a chave `anon`, que é pública de propósito — vai embutida no binário
 * que qualquer pessoa baixa da loja. A proteção real está no RLS do banco,
 * verificado em supabase/tests/01_rls_test.sql.
 */

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { config } from './config';

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Em aplicativo nativo não existe URL de callback para ler: a sessão vem
    // da verificação do código, não do endereço do navegador.
    detectSessionInUrl: false,
  },
});
