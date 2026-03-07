/**
 * Copyright (c) 2025 Comunidad de Madrid & Alastria
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 *
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export type AcceptedCurves = "P-256" | "secp256k1";

export type EcPublicJwk = {
	kty: "EC";
	crv: AcceptedCurves;
	x: string;
	y: string;
};

export type EcPrivateJwk = EcPublicJwk & {
	d: string;
};

export type GeneratedKeys = {
	privateKeyHex: string;
	publicKeyHex: string;
	privateJwk: EcPrivateJwk;
	publicJwk: EcPublicJwk;
};