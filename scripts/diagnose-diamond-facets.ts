  import { JsonRpcProvider, Wallet, Contract, ethers } from "ethers";
  import * as dotenv from "dotenv";
  dotenv.config();

  async function main() {
    const rpcUrl = process.env.RPC_URL!;
    const registryAddr = process.env.DID_REGISTRY_ADDRESS!;
    const priv = process.env.ACCOUNT_PRIVATE_KEY!;

    const provider = new JsonRpcProvider(rpcUrl);
    const wallet = new Wallet(priv, provider);

    // ABI mínima: getDidDocument + updateBaseDocument
    const abi = [
      "function getDidDocument(bytes32 did) view returns (string baseDocument, string[] alsoKnownAs, bytes32[] controllers, bytes32[] vMethodIds, tuple(bytes publicKey, uint8 ellipticType, bool revoked)[] vMethods, tuple(string name, bytes32 vMethodId, uint256 notBefore, uint256 notAfter, uint256 indexDid)[] vRelationships)",
      "function updateBaseDocument(bytes32 did, string baseDocument) external returns (bool)"
    ];

    const registry = new Contract(registryAddr, abi, wallet);

    // ⚠️ aquí necesitamos el bytes32 DID que usa el contrato internamente
    // Si la librería usa keccak256(didString), podríamos hacer:
    const didString = "did:isbe:usecase-demo-01:00d5d67153051f776f7cde38b8bc0df3bef99e6d";
    const didBytes32 = ethers.keccak256(ethers.toUtf8Bytes(didString));

    console.log("DID bytes32:", didBytes32);

    console.log("\nAntes de updateBaseDocument:");
    let [baseBefore] = await registry.getDidDocument(didBytes32);
    console.log("baseDocument =", baseBefore);

    console.log("\nHaciendo updateBaseDocument on-chain directo...");
    const tx = await registry.updateBaseDocument(didBytes32, '{"hola":"mundo-directo"}');
    const receipt = await tx.wait();
    console.log("Receipt status:", receipt.status?.toString());

    console.log("\nDespués de updateBaseDocument:");
    let [baseAfter] = await registry.getDidDocument(didBytes32);
    console.log("baseDocument =", baseAfter);
  }

  main().catch(console.error);
