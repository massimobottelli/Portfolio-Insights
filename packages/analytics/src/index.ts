// Analytics package — contains all business calculations
// Receives domain objects as input, returns derived insights
// Never accesses database directly, never mutates persisted data

export { calculatePositions } from './positions';
export { calculatePortfolioValue } from './portfolio-value';
export { calculateKPIs } from './kpis';