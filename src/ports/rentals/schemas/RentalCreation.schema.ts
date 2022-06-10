import { ChainId, Network } from "@dcl/schemas"
import { JSONSchemaType } from "ajv"
import { RentalCreation } from "../types"
import { PeriodCreationSchema } from "./PeriodCreation.schema"

export const RentalCreationSchema: JSONSchemaType<RentalCreation> = {
  type: "object",
  properties: {
    network: Network.schema as JSONSchemaType<Network>,
    chainId: ChainId.schema as JSONSchemaType<ChainId>,
    expiration: { type: "integer" },
    signature: { type: "string" },
    rawData: { type: "string" },
    tokenId: { type: "string" },
    nonces: {
      type: "array",
      items: {
        minLength: 3,
        maxLength: 3,
        type: "string",
      },
    },
    contractAddress: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
    rentalContractAddress: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
    periods: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: PeriodCreationSchema,
    },
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
    "periods",
  ],
}
