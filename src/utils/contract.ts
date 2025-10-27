/**  
* Copyright (c) 2025 Comunidad de Madrid & Alastria  
*  
* Licensed under the Apache License, Version 2.0 (the "License");  
* you may not use this file except in compliance with the License.  
*  
* You may obtain a copy of the License at  
* [http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0 "http://www.apache.org/licenses/license-2.0")  
*  
* Unless required by applicable law or agreed to in writing, software  
* distributed under the License is distributed on an "AS IS" BASIS,  
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  
* See the License for the specific language governing permissions and  
* limitations under the License.  
*/

import fs from 'fs';
import path from 'path';
import { Provider, JsonRpcProvider, Wallet, Contract } from 'ethers';
import type { DidRegistryConfig } from './config';
 
// export function loadAbi(abiPath: string) {
//   const p = path.resolve(abiPath);
//   if (!fs.existsSync(p)) throw new Error(`ABI no encontrado: ${p}`);
//   return JSON.parse(fs.readFileSync(p, 'utf-8'));
// }
export function loadAbi(abiPath: string) {
  const p = path.resolve(abiPath);
  console.log('Intentando cargar ABI desde:', p);
  if (!fs.existsSync(p)) throw new Error(`ABI no encontrado: ${p}`);
  const artifact = JSON.parse(fs.readFileSync(p, 'utf-8'));

  // Si ya es un array (el ABI directamente)
  if (Array.isArray(artifact)) {
    console.log('ABI cargado (array):', artifact.length, 'entradas');
    return artifact;
  }


  if (artifact.abi && Array.isArray(artifact.abi)) {
    console.log('ABI cargado (objeto):', artifact.abi.length, 'entradas');
    return artifact.abi;
  }

  throw new Error(`Formato de ABI inválido en ${p}`);
}
 
export function createProvider(rpcUrl?: string): JsonRpcProvider {
  const url = rpcUrl ?? process.env.RPC_URL;
  if (!url) throw new Error('RPC_URL no existe');
  return new JsonRpcProvider(url);
}
 
export function createSigner(provider: Provider) {
  const pk = process.env.ACCOUNT_PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY no existe para firma');
  return new Wallet(pk, provider);
}
 
export function getContractFromConfig(cfg: DidRegistryConfig, provider: Provider, useSigner = false) {
  const abi = loadAbi(cfg.didRegistry.abiPath);
  const address = cfg.didRegistry.address;
  if (!address) throw new Error('dirección perdida en donfiguración');
  if (useSigner) {
    const pk = process.env.ACCOUNT_PRIVATE_KEY;
    if (!pk) throw new Error('PRIVATE_KEY necesaria para la operación');
    const wallet = new Wallet(pk, provider);
    return new Contract(address, abi, wallet);
  }
  return new Contract(address, abi, provider);
}