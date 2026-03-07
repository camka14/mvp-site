-- Seeds 15 direct-message style chat groups for camka, each with 25 alternating "hello" messages.
-- Safe to re-run: IDs include a timestamp seed_tag, so each run creates a new batch.

with params as (
  select to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') as seed_tag
),
camka as (
  select id as camka_id
  from "UserData"
  where lower(coalesce("userName", '')) = 'camka'
  order by id
  limit 1
),
others as (
  select id as other_user_id, row_number() over (order by id) as ord
  from "UserData"
  where id <> (select camka_id from camka)
  order by id
  limit 15
),
validation as (
  select
    (select camka_id from camka) as camka_id,
    (select count(*)::int from others) as other_count
),
selected as (
  select
    o.ord,
    o.other_user_id,
    v.camka_id,
    p.seed_tag
  from others o
  cross join validation v
  cross join params p
  where v.camka_id is not null
    and v.other_count = 15
),
insert_chats as (
  insert into "ChatGroup" (id, "createdAt", "updatedAt", name, "userIds", "hostId")
  select
    format('manual_chat_camka_dm_%s_%s', s.seed_tag, lpad(s.ord::text, 2, '0')),
    now(),
    now(),
    format('Camka DM Seed %s', s.ord),
    array[s.camka_id, s.other_user_id]::text[],
    s.camka_id
  from selected s
  returning id
),
message_seed as (
  select
    s.seed_tag,
    s.ord,
    s.camka_id,
    s.other_user_id,
    generate_series(1, 25) as msg_index
  from selected s
),
insert_messages as (
  insert into "Messages" (id, "createdAt", "updatedAt", body, "userId", "attachmentUrls", "chatId", "readByIds", "sentTime")
  select
    format('manual_msg_camka_dm_%s_%s_%s', ms.seed_tag, lpad(ms.ord::text, 2, '0'), lpad(ms.msg_index::text, 2, '0')),
    now() - ((25 - ms.msg_index)::text || ' minutes')::interval,
    now() - ((25 - ms.msg_index)::text || ' minutes')::interval,
    'hello',
    case when (ms.msg_index % 2) = 1 then ms.camka_id else ms.other_user_id end,
    array[]::text[],
    format('manual_chat_camka_dm_%s_%s', ms.seed_tag, lpad(ms.ord::text, 2, '0')),
    array[case when (ms.msg_index % 2) = 1 then ms.camka_id else ms.other_user_id end]::text[],
    now() - ((25 - ms.msg_index)::text || ' minutes')::interval
  from message_seed ms
  returning id
)
select
  v.camka_id,
  v.other_count as available_other_users,
  (select seed_tag from params) as seed_tag,
  (select count(*) from insert_chats) as chats_created,
  (select count(*) from insert_messages) as messages_created
from validation v;
