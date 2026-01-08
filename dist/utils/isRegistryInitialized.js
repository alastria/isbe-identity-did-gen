"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRegistryInitialized = isRegistryInitialized;
const ethers_1 = require("ethers");
const chalk_1 = __importDefault(require("chalk"));
const MIN_ABI = [
    "event DiDRegistryInitialized(uint8 ellipticType)",
    "function getDids(uint256,uint256) view returns (bytes32[],uint256,uint256,uint256,uint256)"
];
async function isRegistryInitialized(provider, contractAddress) {
    const contract = new ethers_1.Contract(contractAddress, MIN_ABI, provider);
    console.log(chalk_1.default.cyan("\n Comprobando si el DID Registry está inicializado..."));
    try {
        const logs = await contract.queryFilter(contract.filters.DiDRegistryInitialized());
        if (logs && logs.length > 0) {
            console.log(chalk_1.default.green(`Evento encontrado. Inicializado en bloque ${logs[0].blockNumber}`));
            return true;
        }
    }
    catch (err) {
        console.log(chalk_1.default.yellow("No se pudo leer evento DiDRegistryInitialized:"), err.message || err);
    }
    try {
        const res = await contract.getDids(0, 50);
        const items = Array.isArray(res) ? res[0] : [];
        if (items && items.length > 0) {
            console.log(chalk_1.default.green(`Existen ${items.length} DIDs → considerado inicializado.`));
            return true;
        }
    }
    catch (err) {
        console.log(chalk_1.default.gray("No se pudo consultar getDids():", err.message || err));
    }
    console.log(chalk_1.default.yellow("No se encontraron indicios de inicialización."));
    return false;
}
