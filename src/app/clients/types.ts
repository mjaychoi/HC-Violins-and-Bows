// src/app/clients/types.ts
export type FilterState = {
  last_name: string[];
  first_name: string[];
  contact_number: string[];
  email: string[];
  tags: string[];
  interest: string[];
  hasInstruments: string[];
};

export interface ClientFilterOptions {
  lastNames: string[];
  firstNames: string[];
  contactNumbers: string[];
  emails: string[];
  tags: string[];
  interests: string[];
}

import { ClientInstrument } from '@/types';
export type ClientRelationshipType = ClientInstrument['relationship_type'];

export type ClientViewFormData = {
  last_name: string;
  first_name: string;
  contact_number: string;
  email: string;
  tags: string[];
  interest: string;
  note: string;
};
