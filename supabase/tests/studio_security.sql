begin;
update public.allowed_signup_domains set enabled=false;
update public.whitelisted_email_addresses set enabled=false;
insert into auth.users(id,email,raw_app_meta_data) values
('d0000000-0000-4000-8000-000000000001','studio-admin@example.invalid','{"provider":"google"}'),
('d0000000-0000-4000-8000-000000000002','studio-member@example.invalid','{"provider":"google"}');
update public.profiles set is_superadmin=true where id='d0000000-0000-4000-8000-000000000001';
set local role anon;
do $$ begin
 begin perform public.studio_save_chain(null,0,'blocked','','[]');raise exception 'FAIL anon write';exception when insufficient_privilege then null;end;
 begin perform count(*) from public.prompt_chain_outputs;raise exception 'FAIL anon read';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"provider":"google"}}',true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.prompt_chain_outputs)<>0 then raise exception 'FAIL member reads';end if;
 begin perform public.studio_save_chain(null,0,'blocked','','[]');raise exception 'FAIL member write';exception when insufficient_privilege then null;end;
 begin perform public.studio_delete_chain(gen_random_uuid(),1);raise exception 'FAIL member delete';exception when insufficient_privilege then null;end;
 begin perform public.studio_start_generation(gen_random_uuid(),1,'{}');raise exception 'FAIL member run';exception when insufficient_privilege then null;end;
 begin update public.profiles set is_superadmin=true where id=auth.uid();raise exception 'FAIL self promotion';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"provider":"google"}}',true);
set local role authenticated;
do $$ declare c uuid; m uuid; a uuid:=gen_random_uuid();b uuid:=gen_random_uuid(); plan jsonb; req uuid; steps jsonb;begin
 select id into m from public.llm_models where enabled and supports_vision limit 1;
 steps:=jsonb_build_array(jsonb_build_object('id',a,'name','Observe','model_id',m,'system_prompt','Describe image','input_kind','image','output_format','text'),jsonb_build_object('id',b,'name','Write','model_id',m,'system_prompt','Write five captions','input_kind','previous_text','output_format','captions_json'));
 c:=public.studio_save_chain(null,0,'Transactional studio fixture','Fixture',steps);
 if (select count(*) from public.prompt_chain_steps where chain_id=c)<>2 then raise exception 'FAIL create steps';end if;
 -- Reordering is one transaction and preserves step IDs.
 perform public.studio_save_chain(c,1,'Renamed fixture','Updated',jsonb_build_array(steps->1,steps->0));
 if (select id from public.prompt_chain_steps where chain_id=c and step_order=1)<>b then raise exception 'FAIL reorder';end if;
 begin perform public.studio_save_chain(c,1,'stale','','[]');raise exception 'FAIL stale save';exception when serialization_failure then null;end;
 begin perform public.studio_start_generation(c,2,'{}');raise exception 'FAIL invalid topology';exception when raise_exception then if sqlerrm='FAIL invalid topology' then raise;end if;end;
 perform public.studio_save_chain(c,2,'Renamed fixture','Updated',steps);
 plan:=public.studio_start_generation(c,3,'{"storage_path":"fixture.png"}');req:=(plan->>'request_id')::uuid;
 begin perform public.studio_save_chain(c,3,'running','','[]');raise exception 'FAIL running edit';exception when raise_exception then if sqlerrm='FAIL running edit' then raise;end if;end;
 perform public.admin_log_response(req,a,m,'Snapshot prompt','Description','{}',200,10);
 perform public.studio_finish_generation(req,'{"captions":["Fixture caption"]}','["Fixture caption"]');
 if not exists(select 1 from public.prompt_chain_outputs where request_id=req and chain_version=3) then raise exception 'FAIL saved media';end if;
 -- Deleting a step keeps historical prompt/output logs.
 perform public.studio_save_chain(c,3,'Renamed fixture','Updated',jsonb_build_array(steps->1));
 if exists(select 1 from public.prompt_chain_steps where id=a) then raise exception 'FAIL delete step';end if;
 if not exists(select 1 from public.llm_responses where request_id=req and step_id is null and prompt_snapshot='Snapshot prompt') then raise exception 'FAIL retained log';end if;
 perform public.studio_delete_chain(c,4);
 if not exists(select 1 from public.prompt_chains where id=c and deleted_at is not null) then raise exception 'FAIL chain delete';end if;
 if not exists(select 1 from public.prompt_chain_outputs where chain_id=c) then raise exception 'FAIL retained outputs';end if;
 begin insert into public.prompt_chains(name,description) values('direct','blocked');raise exception 'FAIL direct writes';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
select 'PASS: anonymous/member denial, self-promotion blocked, chain/step CRUD, atomic reorder, stale edit rejection, run locking, media persistence and history retention. All fixtures rolled back.' as result;
