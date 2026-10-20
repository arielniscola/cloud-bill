import type { CashMovementConcept, CashMovementDirection } from '../types';

export const CASH_CONCEPT_LABELS: Record<CashMovementConcept, string> = {
  RETIRO: 'Retiro de efectivo',
  DEPOSITO_BANCARIO: 'Depósito bancario',
  GASTO: 'Gasto',
  APORTE: 'Aporte',
  FONDO_CAMBIO: 'Fondo de cambio',
  EXTRACCION_BANCARIA: 'Extracción bancaria',
  OTRO: 'Otro',
};

/** Conceptos válidos según el sentido (igual que en el backend). */
export const CASH_CONCEPTS_BY_TYPE: Record<CashMovementDirection, CashMovementConcept[]> = {
  OUT: ['RETIRO', 'DEPOSITO_BANCARIO', 'GASTO', 'OTRO'],
  IN: ['APORTE', 'FONDO_CAMBIO', 'EXTRACCION_BANCARIA', 'OTRO'],
};

/** Conceptos que mueven también una cuenta bancaria. */
export const isBankConcept = (c: CashMovementConcept) => c === 'DEPOSITO_BANCARIO' || c === 'EXTRACCION_BANCARIA';
