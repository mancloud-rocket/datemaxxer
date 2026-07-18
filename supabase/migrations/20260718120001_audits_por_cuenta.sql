-- Pivote de producto (Fernando, 18-jul): la auditoría vive DENTRO de la app con login.
-- Las auditorías van a las tablas canónicas del spec (photo_sets, por usuario);
-- free_audits (flujo anónimo por email) muere sin haberse usado en producción.

alter table percentil.photo_sets
  add column progress jsonb not null default '{"fotos_analizadas":0,"total":0}',
  add column error text;

drop table percentil.free_audits;
