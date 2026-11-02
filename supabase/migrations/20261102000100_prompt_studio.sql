begin;
alter table public.prompt_chains add column deleted_at timestamptz;
alter table public.llm_responses alter column step_id drop not null;
alter table public.llm_responses drop constraint llm_responses_step_id_fkey;
alter table public.llm_responses add constraint llm_responses_step_id_fkey foreign key(step_id) references public.prompt_chain_steps(id) on delete set null;
alter table public.prompt_chain_steps drop constraint prompt_chain_steps_chain_id_step_order_key;
alter table public.prompt_chain_steps add constraint prompt_steps_order unique(chain_id,step_order) deferrable initially deferred;
create table public.prompt_chain_outputs (
 id uuid primary key default gen_random_uuid(), chain_id uuid not null references public.prompt_chains(id),
 request_id uuid not null unique references public.generation_requests(id), storage_path text not null,
 output_text text not null, captions jsonb not null default '[]', chain_version integer not null,
 created_at timestamptz not null default now()
);
alter table public.prompt_chain_outputs enable row level security;
revoke all on public.prompt_chain_outputs from public,anon,authenticated;
grant select on public.prompt_chain_outputs to authenticated;
create policy "Superadmins read chain outputs" on public.prompt_chain_outputs for select to authenticated using ((select public.is_superadmin()));
create index chain_outputs_recent on public.prompt_chain_outputs(chain_id,created_at desc);
create function public.studio_save_chain(target_id uuid,expected_version integer,chain_name text,chain_description text,steps jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; current_version integer; item jsonb; position integer:=0; step_id uuid; seen uuid[]:='{}'; begin
 if not public.is_superadmin() then raise exception 'Superadmin required' using errcode='42501'; end if;
 if chain_name is null or char_length(trim(chain_name)) not between 1 and 100 or chain_description is null or char_length(chain_description)>2000 then raise exception 'Enter a name (1–100) and description (up to 2000 characters)'; end if;
 if steps is null or jsonb_typeof(steps)<>'array' or jsonb_array_length(steps)>8 then raise exception 'Use up to eight steps'; end if;
 if target_id is null then
  insert into public.prompt_chains(name,description) values(trim(chain_name),trim(chain_description)) returning id into result;
 else
  select version into current_version from public.prompt_chains where id=target_id and deleted_at is null for update;
  if not found then raise exception 'Chain not found'; end if;
  if expected_version is null or current_version<>expected_version then raise exception 'This chain changed in another window. Reload before saving.' using errcode='40001'; end if;
  if exists(select 1 from public.generation_requests where chain_id=target_id and status='running' and created_at>now()-interval '10 minutes') then raise exception 'Wait for the active generation to finish before editing'; end if;
  result:=target_id;
  update public.prompt_chains set name=trim(chain_name),description=trim(chain_description),version=version+1 where id=result;
 end if;

 for item in select value from jsonb_array_elements(steps) loop
  position:=position+1;
  if char_length(trim(coalesce(item->>'name',''))) not between 1 and 100 or char_length(trim(coalesce(item->>'system_prompt',''))) not between 1 and 12000
    or coalesce(item->>'input_kind','') not in ('image','previous_text') or coalesce(item->>'output_format','') not in ('text','captions_json') then raise exception 'Each step needs a name, prompt, input and output'; end if;
  if not exists(select 1 from public.llm_models where id=(item->>'model_id')::uuid) then raise exception 'Choose an existing model'; end if;
  step_id:=coalesce((item->>'id')::uuid,gen_random_uuid());
  if step_id=any(seen) then raise exception 'Duplicate step'; end if; seen:=array_append(seen,step_id);
  if exists(select 1 from public.prompt_chain_steps where id=step_id and chain_id<>result) then raise exception 'Step belongs to another chain'; end if;
  insert into public.prompt_chain_steps(id,chain_id,step_order,name,model_id,system_prompt,input_kind,output_format)
  values(step_id,result,position,trim(item->>'name'),(item->>'model_id')::uuid,trim(item->>'system_prompt'),item->>'input_kind',item->>'output_format')
  on conflict(id) do update set step_order=excluded.step_order,name=excluded.name,model_id=excluded.model_id,system_prompt=excluded.system_prompt,input_kind=excluded.input_kind,output_format=excluded.output_format;
 end loop;
 delete from public.prompt_chain_steps where chain_id=result and not(id=any(seen));
 return result;
end $$;
create function public.studio_delete_chain(target_id uuid,expected_version integer) returns void language plpgsql security definer set search_path='' as $$
declare v integer; begin
 if not public.is_superadmin() then raise exception 'Superadmin required' using errcode='42501'; end if;
 select version into v from public.prompt_chains where id=target_id and deleted_at is null for update;
 if not found then raise exception 'Chain not found'; end if;
 if expected_version is null or v<>expected_version then raise exception 'This chain changed. Reload before deleting.' using errcode='40001'; end if;
 if exists(select 1 from public.generation_requests where chain_id=target_id and status='running' and created_at>now()-interval '10 minutes') then raise exception 'Wait for the active generation to finish'; end if;
 update public.prompt_chains set deleted_at=now(),version=version+1 where id=target_id;
 update public.prompt_chain_mix set enabled=false,updated_at=now() where chain_id=target_id;
end $$;
create function public.studio_start_generation(target_chain uuid,expected_version integer,metadata jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v integer; plan jsonb; request_id uuid; begin
 if not public.is_superadmin() then raise exception 'Superadmin required' using errcode='42501'; end if;
 select version into v from public.prompt_chains where id=target_chain and deleted_at is null for update;
 if not found then raise exception 'Chain not found'; end if;
 if expected_version is null or v<>expected_version then raise exception 'Save or reload your chain before running' using errcode='40001'; end if;
 if exists(select 1 from public.generation_requests where user_id=auth.uid() and status='running' and created_at>now()-interval '10 minutes') then raise exception 'Another generation is running. Please wait'; end if;
 select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'system_prompt',s.system_prompt,'input_kind',s.input_kind,'output_format',s.output_format,'model_id',m.id,'model_identifier',m.model_identifier,'enabled',m.enabled and p.enabled,'provider_type',p.provider_type,'supports_vision',m.supports_vision) order by s.step_order) into plan
 from public.prompt_chain_steps s join public.llm_models m on m.id=s.model_id join public.llm_providers p on p.id=m.provider_id where s.chain_id=target_chain;
 if plan is null or jsonb_array_length(plan)>8 or plan->0->>'input_kind'<>'image' then raise exception 'Start the chain with an image step; use 1–8 steps'; end if;
 if exists(select 1 from jsonb_array_elements(plan) with ordinality s(value,n) where (n>1 and value->>'input_kind'<>'previous_text') or (n<jsonb_array_length(plan) and value->>'output_format'<>'text') or not (value->>'enabled')::boolean or value->>'provider_type'<>'google' or (value->>'input_kind'='image' and not (value->>'supports_vision')::boolean)) then raise exception 'Use enabled Gemini models, text intermediate outputs, and previous-step input after the first step'; end if;
 insert into public.generation_requests(user_id,chain_id,input_metadata) values(auth.uid(),target_chain,metadata||jsonb_build_object('source','prompt-studio','chain_version',v,'plan',plan)) returning id into request_id;
 return jsonb_build_object('request_id',request_id,'steps',plan,'version',v);
end $$;
create function public.studio_finish_generation(target_request uuid,output_text text,output_captions jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.generation_requests; begin
 if not public.is_superadmin() then raise exception 'Superadmin required' using errcode='42501'; end if;
 select * into r from public.generation_requests where id=target_request and user_id=auth.uid() and status='running' for update;
 if not found or r.input_metadata->>'source'<>'prompt-studio' then raise exception 'Invalid request'; end if;
 insert into public.prompt_chain_outputs(chain_id,request_id,storage_path,output_text,captions,chain_version) values(r.chain_id,r.id,r.input_metadata->>'storage_path',output_text,output_captions,(r.input_metadata->>'chain_version')::integer);
 update public.generation_requests set status='succeeded',completed_at=now() where id=r.id;
end $$;
revoke all on function public.studio_save_chain(uuid,integer,text,text,jsonb),public.studio_delete_chain(uuid,integer),public.studio_start_generation(uuid,integer,jsonb),public.studio_finish_generation(uuid,text,jsonb) from public,anon;
grant execute on function public.studio_save_chain(uuid,integer,text,text,jsonb),public.studio_delete_chain(uuid,integer),public.studio_start_generation(uuid,integer,jsonb),public.studio_finish_generation(uuid,text,jsonb) to authenticated;
commit;
