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
 
import { Contract, JsonRpcProvider } from "ethers";
import chalk from "chalk";

const MIN_ABI = [
  "event DiDRegistryInitialized(uint8 ellipticType)",
  "function getDids(uint256,uint256) view returns (bytes32[],uint256,uint256,uint256,uint256)"
];

export async function isRegistryInitialized(provider: JsonRpcProvider, contractAddress: string): Promise<boolean> {
  const contract = new Contract(contractAddress, MIN_ABI, provider);
  console.log(chalk.cyan("\n Comprobando si el DID Registry está inicializado..."));
 
  try {
    const logs = await contract.queryFilter(contract.filters.DiDRegistryInitialized());
    if (logs && logs.length > 0) {
      console.log(chalk.green(`Evento encontrado. Inicializado en bloque ${logs[0].blockNumber}`));
      return true;
    }
  } catch (err: any) {
    console.log(chalk.yellow("No se pudo leer evento DiDRegistryInitialized:"), err.message || err);
  }
 
  try {
    const res = await contract.getDids(0,50);
    const items = Array.isArray(res) ? res[0] : [];
    if (items && items.length > 0) {
      console.log(chalk.green(`Existen ${items.length} DIDs → considerado inicializado.`));
      return true;
    }
  } catch (err: any) {
    console.log(chalk.gray("No se pudo consultar getDids():", err.message || err));
  }
 
  console.log(chalk.yellow("No se encontraron indicios de inicialización."));
  return false;
}