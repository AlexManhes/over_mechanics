import test from 'node:test';
import assert from 'node:assert/strict';
import { todayBrasilia,addDays,deadline,returnWithin,validateRepair,normalizePlate,validPlate,dayNumber,repairState,selectRepairs } from '../lib/domain.mjs';
test('Brasília usa a data local mesmo depois da meia-noite UTC',()=>{
  assert.equal(todayBrasilia(new Date('2026-10-25T02:59:59Z')),'2026-10-24');
  assert.equal(todayBrasilia(new Date('2026-10-25T03:00:00Z')),'2026-10-25');
});
test('prazos de 30 e 60 dias atravessam meses e anos',()=>{
  assert.equal(addDays('2026-10-24',30),'2026-11-23');
  assert.equal(addDays('2026-10-24',60),'2026-12-23');
  assert.equal(addDays('2026-12-15',60),'2027-02-13');
  assert.equal(addDays('2024-02-01',30),'2024-03-02');
});
test('verde, laranja, vence hoje e encerrado; limite configurável',()=>{
  const r={completed:'2026-09-24',days:30};
  assert.equal(deadline(r,7,'2026-10-16').status,'active');
  assert.equal(deadline(r,7,'2026-10-17').status,'warning');
  assert.equal(deadline(r,3,'2026-10-17').status,'active');
  assert.equal(deadline(r,7,'2026-10-23').remaining,1);
  assert.equal(deadline(r,7,'2026-10-24').label,'Vence hoje');
  assert.equal(deadline(r,7,'2026-10-24').status,'today');
  assert.equal(deadline(r,7,'2026-10-25').status,'expired');
  assert.equal(deadline(r,7,'2026-10-25').label,'Prazo encerrado há 1 dia');
  assert.equal(deadline(r,7,'2026-10-27').label,'Prazo encerrado há 3 dias');
});
test('retorno inclui último dia, preserva original e rejeita data anterior',()=>{
  const r={completed:'2026-09-24',days:30};
  assert.equal(returnWithin(r,'2026-10-24'),true);
  assert.equal(returnWithin(r,'2026-10-25'),false);
  assert.deepEqual(r,{completed:'2026-09-24',days:30});
  assert.throws(()=>returnWithin(r,'2026-09-23'));
});
test('normaliza placa; valida datas, campos obrigatórios e prazo personalizado',()=>{
  assert.equal(normalizePlate('abc-1d23'),'ABC1D23');assert.equal(validPlate('ABC-1234'),true);assert.equal(validPlate('ABC1D23'),true);assert.equal(validPlate('ABC123'),false);
  assert.throws(()=>dayNumber('2026-02-30'));
  const r={plate:'ABC1D23',completed:'2026-10-24',days:90,complaint:'Falha',diagnosis:'Sensor',service:'Troca',mechanic:'João'};
  assert.doesNotThrow(()=>validateRepair(r,'2026-10-24'));
  for(const patch of [{days:0},{days:2.5},{days:3651},{completed:'2026-10-25'},{diagnosis:''},{plate:'abc'}])assert.throws(()=>validateRepair({...r,...patch},'2026-10-24'));
});
test('arquiva automaticamente após a virada de Brasília sem interromper o último dia',()=>{
  const original={id:'reparo',vehicle_id:'v1',completed:'2026-09-24',days:30,service:'Reparo concluído'};
  const vehicles=[{id:'v1',plate:'ABC1D23'}];
  const last=todayBrasilia(new Date('2026-10-25T02:59:59Z'));
  const next=todayBrasilia(new Date('2026-10-25T03:00:00Z'));
  assert.equal(repairState(original,7,last).archived,false);
  assert.equal(selectRepairs([original],vehicles,{scope:'active',today:last}).length,1);
  assert.equal(selectRepairs([original],vehicles,{scope:'active',today:next}).length,0);
  assert.equal(selectRepairs([original],vehicles,{scope:'archived',plate:'abc-1d',today:next}).length,1);
  assert.equal(repairState(original,7,next).archivedOn,'2026-10-25');
  assert.equal(selectRepairs([original],vehicles,{scope:'all',today:'2027-10-24'}).length,1);
  assert.equal(returnWithin(original,'2027-10-24'),false);
  assert.deepEqual(original,{id:'reparo',vehicle_id:'v1',completed:'2026-09-24',days:30,service:'Reparo concluído'});
});
