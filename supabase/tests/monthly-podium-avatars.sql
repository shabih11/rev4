begin;
insert into public.profiles(id,data) values ('podium-avatar-test','{"id":"podium-avatar-test","name":"Podium test","role":"employee","branch":"جاليري"}');
insert into auth.users(id,email) values ('60000000-0000-4000-8000-000000000001','podium-avatar@example.invalid');
insert into public.user_access(uid,profile_id,role,branch) values ('60000000-0000-4000-8000-000000000001','podium-avatar-test','employee','جاليري');
insert into public.avatar_collections(id,name,price) values ('60000000-0000-4000-8000-000000000002','Podium test',1500);
insert into public.avatar_variants(id,collection_id,name,image_path) values
 ('60000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000002','October','60000000-0000-4000-8000-000000000003.webp'),
 ('60000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000002','November','60000000-0000-4000-8000-000000000004.webp');
insert into public.avatar_purchases(variant_id,profile_id,price_paid,purchased_at) values
 ('60000000-0000-4000-8000-000000000003','podium-avatar-test',2000,'2025-10-01T00:00:00+03:00'),
 ('60000000-0000-4000-8000-000000000004','podium-avatar-test',2000,'2025-11-01T00:00:00+03:00');
-- Selection immediately before midnight in Riyadh belongs to October.
insert into public.avatar_equipped(profile_id,variant_id) values ('podium-avatar-test','60000000-0000-4000-8000-000000000003');
update private.avatar_selection_history set selected_at='2025-10-31T23:59:59+03:00' where profile_id='podium-avatar-test';
update public.avatar_equipped set variant_id='60000000-0000-4000-8000-000000000004' where profile_id='podium-avatar-test';
update private.avatar_selection_history set selected_at='2025-11-01T00:00:00+03:00' where profile_id='podium-avatar-test' and variant_id='60000000-0000-4000-8000-000000000004';
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if public.get_monthly_avatars('2025-10-01')->>'podium-avatar-test'<>'60000000-0000-4000-8000-000000000003.webp' then raise exception 'October avatar changed with November selection'; end if;
 if public.get_monthly_avatars('2025-11-01')->>'podium-avatar-test'<>'60000000-0000-4000-8000-000000000004.webp' then raise exception 'November avatar missing'; end if;
 if public.get_monthly_avatars('2025-09-01') ? 'podium-avatar-test' then raise exception 'Future purchase leaked into September'; end if;
 begin perform public.get_monthly_avatars('2025-10-02'); raise exception 'Non-month date accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.get_monthly_avatars(null); raise exception 'Null date accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.get_monthly_avatars((date_trunc('month',now() at time zone 'Asia/Riyadh'))::date); raise exception 'Unfinished month accepted'; exception when invalid_parameter_value then null; end;
 begin perform 1 from private.avatar_selection_history; raise exception 'Private history exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Default selection must be recorded rather than falling back to a purchased avatar.
delete from public.avatar_equipped where profile_id='podium-avatar-test';
update private.avatar_selection_history set selected_at='2025-12-01T00:00:00+03:00' where profile_id='podium-avatar-test' and variant_id is null;
set local role authenticated;
do $$ begin
 if public.get_monthly_avatars('2025-12-01')->'podium-avatar-test' is distinct from 'null'::jsonb then raise exception 'Default selection lost'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
set local role authenticated;
do $$ begin
 begin perform public.get_monthly_avatars('2025-10-01'); raise exception 'Non-member accessed history'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.get_monthly_avatars('2025-10-01'); raise exception 'Anonymous accessed history'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
