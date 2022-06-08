import { ChainId, Network } from "@dcl/schemas"

export const RentalCreationSchema = Object.freeze({
  type: "object",
  properties: {
    network: Network.schema,
    chainId: ChainId.schema,
    expiration: { type: "number" },
    signature: { type: "string" },
    rawData: { type: "string" },
    tokenId: { type: "string" },
    contractAddress: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
    rentalContractAddress: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
  },
  additionalProperties: false,
  required: [
    "network",
    "chainId",
    "expiration",
    "signature",
    "rawData",
    "tokenId",
    "contractAddress",
    "rentalContractAddress",
  ],
})
