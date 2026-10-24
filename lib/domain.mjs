export function todayBrasilia(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = type => parts.find(p => p.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function dayNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Data inválida.');
  const time = Date.parse(`${value}T12:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== value) throw new Error('Data inválida.');
  return Math.floor(time / 86400000);
}
export function addDays(date, days) { return new Date((dayNumber(date) + Number(days)) * 86400000).toISOString().slice(0,10); }
export function deadline(repair, alertDays = 7, today = todayBrasilia()) {
  const end = addDays(repair.completed, repair.days);
  const remaining = dayNumber(end) - dayNumber(today);
  return { end, remaining, status: remaining < 0 ? 'expired' : remaining === 0 ? 'today' : remaining <= alertDays ? 'warning' : 'active', label: remaining < 0 ? `Prazo encerrado há ${-remaining} ${remaining === -1 ? 'dia' : 'dias'}` : remaining === 0 ? 'Vence hoje' : `Faltam ${remaining} ${remaining === 1 ? 'dia' : 'dias'}` };
}
// Arquivamento é uma classificação por data, sem alterar ou apagar o reparo.
export function repairState(repair, alertDays = 7, today = todayBrasilia()) {
  const value = deadline(repair, alertDays, today);
  const archived = value.remaining < 0;
  return { ...repair, deadline: value, archived, archivedOn: archived ? addDays(value.end, 1) : null };
}
export function selectRepairs(repairs, vehicles, { scope = 'all', plate = '', status = 'all', alertDays = 7, today = todayBrasilia() } = {}) {
  const search = normalizePlate(plate);
  const plates = new Map(vehicles.map(v => [v.id, v.plate]));
  return repairs.filter(r => {
    const value = repairState(r, alertDays, today);
    return (scope === 'all' || (scope === 'archived' ? value.archived : !value.archived))
      && (plates.get(r.vehicle_id) || '').includes(search)
      && (status === 'all' || (status === 'warning' ? ['warning','today'].includes(value.deadline.status) : value.deadline.status === status));
  });
}
export function normalizePlate(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
export function validPlate(value) { return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(normalizePlate(value)); }
export function returnWithin(repair, date) {
  if (dayNumber(date) < dayNumber(repair.completed)) throw new Error('O retorno não pode ser anterior à conclusão.');
  return dayNumber(date) <= dayNumber(addDays(repair.completed, repair.days));
}
export function validateRepair(input, today = todayBrasilia()) {
  if (!validPlate(input.plate)) throw new Error('Informe uma placa brasileira válida: ABC1234 ou ABC1D23.');
  for (const field of ['complaint', 'diagnosis', 'service', 'mechanic']) if (!String(input[field] || '').trim()) throw new Error('Preencha defeito, diagnóstico, serviço e mecânico.');
  if (dayNumber(input.completed) > dayNumber(today)) throw new Error('A conclusão não pode estar no futuro.');
  if (!Number.isInteger(Number(input.days)) || Number(input.days) < 1 || Number(input.days) > 3650) throw new Error('O prazo deve ser um número inteiro entre 1 e 3650 dias.');
}
