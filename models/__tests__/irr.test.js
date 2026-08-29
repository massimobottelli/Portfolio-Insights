/**
 * Unit Tests — IRR Engine (Pure Functions)
 *
 * Testa utils/irrEngine.js senza dipendenze DB.
 * Casi di test basati sui casi deterministici della Fase 1.
 */

import { describe, it, expect } from 'vitest';
import { npv, npvDerivative, solveIRR } from '../../utils/irrEngine.js';

describe('irrEngine — npv', () => {
  it('should return correct NPV for simple single-period case', () => {
    // -1000 at t=0, +1100 at t=1, rate=10% → NPV = -1000 + 1100/1.1 = 0
    const flows = [
      { amount: -1000, timeWeight: 0 },
      { amount: 1100, timeWeight: 1 },
    ];
    expect(npv(flows, 0.1)).toBeCloseTo(0, 6);
  });

  it('should handle zero rate correctly', () => {
    // Con rate=0, NPV = somma semplice degli importi
    const flows = [
      { amount: -1000, timeWeight: 0 },
      { amount: 300, timeWeight: 0.5 },
      { amount: 800, timeWeight: 1 },
    ];
    expect(npv(flows, 0)).toBeCloseTo(100, 6);
  });
});

describe('irrEngine — npvDerivative', () => {
  it('should return correct derivative value', () => {
    const flows = [
      { amount: -1000, timeWeight: 0 },
      { amount: 1100, timeWeight: 1 },
    ];
    // f'(r) = (-1 * 1100) / (1.1^2) ≈ -909.09
    expect(npvDerivative(flows, 0.1)).toBeCloseTo(-1100 / 1.21, 4);
  });
});

describe('irrEngine — solveIRR', () => {
  function verifyConvergence(cashFlows) {
    const irr = solveIRR(cashFlows);
    expect(Number.isFinite(irr)).toBe(true);
    expect(irr).not.toBeNaN();
    return irr;
  }
  // ─── Test A — Singolo acquisto, guadagno semplice ───
  // 2023-01-01 -1000, 2026-01-01 +1210 | Durata: 3 anni | IRR ≈ 6,54%
  it('Test A: singolo acquisto con guadagno esatto (6,54%)', () => {
    const cashFlows = [
      { date: '2023-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 1210 },
    ];
    const expected = Math.pow(1210 / 1000, 1 / 3) - 1;
    const irr = verifyConvergence(cashFlows);
    expect(irr).toBeCloseTo(expected, 4);
  });

  // ─── Test B — Acquisti scalari multipli ───
  // 2023-01-01 -1000, 2024-01-01 -1000, 2025-01-01 -1000, 2026-01-01 +3500 | IRR ≈ 7,91%
  it('Test B: acquisti scalari multipli (~7,91%)', () => {
    const cashFlows = [
      { date: '2023-01-01', amount: -1000 },
      { date: '2024-01-01', amount: -1000 },
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 3500 },
    ];
    const irr = verifyConvergence(cashFlows);
    // Valore verificato: NPV(0.0791) ≈ 0
    expect(irr).toBeGreaterThan(0.075);
    expect(irr).toBeLessThan(0.085);
  });

  // ─── Test C — Con dividendi intermedi ───
  // 2023-06-01 -1000, 2024-06-01 +50, 2025-06-01 +50, 2026-06-01 +1100 | IRR ≈ 6,56%
  it('Test C: con dividendi intermedi (~6,56%)', () => {
    const cashFlows = [
      { date: '2023-06-01', amount: -1000 },
      { date: '2024-06-01', amount: 50 },
      { date: '2025-06-01', amount: 50 },
      { date: '2026-06-01', amount: 1100 },
    ];
    const irr = verifyConvergence(cashFlows);
    // Valore verificato: NPV(0.0656) ≈ 0
    expect(irr).toBeGreaterThan(0.06);
    expect(irr).toBeLessThan(0.07);
  });

  // ─── Test D — Perdita ───
  // 2023-01-01 -1000, 2026-01-01 +800 | IRR ≈ -6,93%
  it('Test D: perdita (-6,93% in 3 anni)', () => {
    const cashFlows = [
      { date: '2023-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 800 },
    ];
    const expected = Math.pow(800 / 1000, 1 / 3) - 1;
    const irr = verifyConvergence(cashFlows);
    expect(irr).toBeCloseTo(expected, 4);
  });

  // ─── Test E — Edge: meno di 2 flussi ───
  it('Test E: meno di 2 flussi → null', () => {
    expect(solveIRR([{ date: '2024-01-01', amount: -1000 }])).toBeNull();
    expect(solveIRR([])).toBeNull();
    expect(solveIRR(null)).toBeNull();
    expect(solveIRR(undefined)).toBeNull();
  });

  // ─── Test F — Edge: tutti positivi ───
  it('Test F: tutti flussi positivi → null', () => {
    expect(solveIRR([
      { date: '2023-01-01', amount: 500 },
      { date: '2024-01-01', amount: 300 },
    ])).toBeNull();
  });

  // ─── Test G — Edge: tutti negativi ───
  it('Test G: tutti flussi negativi → null', () => {
    expect(solveIRR([
      { date: '2023-01-01', amount: -500 },
      { date: '2024-01-01', amount: -500 },
    ])).toBeNull();
  });

  // ─── Test H — Edge: stessa data ───
  it('Test H: tutti flussi nella stessa data → null', () => {
    expect(solveIRR([
      { date: '2023-01-01', amount: -500 },
      { date: '2023-01-01', amount: 500 },
    ])).toBeNull();
  });

  // ─── Test I — Ordine input non critico ───
  it('Test I: input non ordinato produce stesso IRR', () => {
    const unordered = [
      { date: '2026-01-01', amount: 1210 },
      { date: '2023-01-01', amount: -1000 },
    ];
    const ordered = [
      { date: '2023-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 1210 },
    ];
    expect(solveIRR(unordered)).toBe(solveIRR(ordered));
  });

  // ─── Test J — Molti flussi regolari ───
  it('Test J: molti flussi mensili converge correttamente', () => {
    const flows = [];
    for (let m = 0; m < 12; m++) {
      flows.push({
        date: `2023-${String(m + 1).padStart(2, '0')}-01`,
        amount: -100,
      });
    }
    flows.push({ date: '2024-06-01', amount: 1300 });
    const irr = verifyConvergence(flows);
    expect(irr).not.toBeNull();
  });

  // ─── Verifica: nessun NaN/Infinity su dataset realistici ───
  it('Verifica: nessun NaN o Infinity in output', () => {
    const cases = [
      [{ date: '2020-01-01', amount: -10000 }, { date: '2025-01-01', amount: 15000 }],
      [
        { date: '2020-01-01', amount: -2000 },
        { date: '2021-01-01', amount: -2000 },
        { date: '2022-01-01', amount: -2000 },
        { date: '2023-01-01', amount: -2000 },
        { date: '2024-01-01', amount: -2000 },
        { date: '2025-01-01', amount: 12000 },
      ],
      [
        { date: '2020-06-01', amount: -5000 },
        { date: '2021-06-01', amount: 100 },
        { date: '2022-06-01', amount: 100 },
        { date: '2023-06-01', amount: 100 },
        { date: '2024-06-01', amount: 6000 },
      ],
    ];
    for (const c of cases) {
      const irr = solveIRR(c);
      expect(irr).not.toBeNaN();
      expect(irr).not.toBe(Infinity);
      expect(irr).not.toBe(-Infinity);
    }
  });
});

