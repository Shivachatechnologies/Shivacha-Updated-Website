import type { Service } from "./types";
import { aiServices } from "./services/ai";
import { digitalServices, apiServices } from "./services/digital";
import { bankingServices, embeddedServices } from "./services/fintech-banking";
import { paymentServices, cardServices } from "./services/fintech-payments";
import { lendingServices, wealthServices, web3FintechServices, hybridServices } from "./services/fintech-credit";
import { web3StrategyServices, protocolServices, smartContractServices, defiServices } from "./services/web3-core";
import { rwaServices, digitalAssetServices, walletServices, exchangeServices } from "./services/web3-assets";
import {
  stablecoinServices,
  web3PaymentServices,
  web3IdentityServices,
  web3DataServices,
  web3SecurityServices,
} from "./services/web3-money";
import { cloudServices, devopsServices, cyberServices } from "./services/cloud";

export const services: Service[] = [
  ...aiServices,
  ...digitalServices,
  ...apiServices,
  ...bankingServices,
  ...embeddedServices,
  ...paymentServices,
  ...cardServices,
  ...lendingServices,
  ...wealthServices,
  ...web3FintechServices,
  ...hybridServices,
  ...web3StrategyServices,
  ...protocolServices,
  ...smartContractServices,
  ...defiServices,
  ...rwaServices,
  ...digitalAssetServices,
  ...walletServices,
  ...exchangeServices,
  ...stablecoinServices,
  ...web3PaymentServices,
  ...web3IdentityServices,
  ...web3DataServices,
  ...web3SecurityServices,
  ...cloudServices,
  ...devopsServices,
  ...cyberServices,
];

const bySlug = new Map(services.map((s) => [s.slug, s]));
export const getService = (slug: string) => bySlug.get(slug);
