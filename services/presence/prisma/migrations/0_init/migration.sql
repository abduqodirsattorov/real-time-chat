--
-- PostgreSQL database dump
--

\restrict 54G7gldvNjEL8DxHQHa9CK78iBXlxY2MZNCHnWQV5AWEc8eN0lcus1M2hQvSJDf

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: timescaledb; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS timescaledb WITH SCHEMA public;


--
-- Name: EXTENSION timescaledb; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION timescaledb IS 'Enables scalable inserts and complex queries for time-series data (Community Edition)';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: call_direction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.call_direction AS ENUM (
    'inbound',
    'outbound',
    'internal'
);


--
-- Name: call_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.call_status AS ENUM (
    'initiating',
    'ringing',
    'queued',
    'connected',
    'on_hold',
    'transferring',
    'completed',
    'failed',
    'no_answer',
    'canceled'
);


--
-- Name: device_platform; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.device_platform AS ENUM (
    'ios',
    'android',
    'web'
);


--
-- Name: message_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_type AS ENUM (
    'text',
    'image',
    'video',
    'audio',
    'file',
    'voice',
    'system',
    'call_log',
    'bot_card',
    'bot_quick_reply'
);


--
-- Name: operator_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.operator_status AS ENUM (
    'offline',
    'available',
    'busy',
    'away',
    'on_call',
    'in_transfer',
    'break'
);


--
-- Name: recording_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.recording_status AS ENUM (
    'starting',
    'active',
    'processing',
    'completed',
    'failed'
);


--
-- Name: room_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.room_status AS ENUM (
    'open',
    'closed',
    'pending',
    'bot_handling'
);


--
-- Name: room_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.room_type AS ENUM (
    'direct',
    'support',
    'transfer_consult'
);


--
-- Name: transfer_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transfer_status AS ENUM (
    'initiated',
    'consulting',
    'completed',
    'failed',
    'canceled'
);


--
-- Name: transfer_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transfer_type AS ENUM (
    'cold',
    'warm'
);


--
-- Name: user_locale; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_locale AS ENUM (
    'uz',
    'ru'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'customer',
    'operator',
    'supervisor',
    'admin',
    'bot'
);


--
-- Name: user_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_status AS ENUM (
    'active',
    'suspended',
    'deleted'
);


--
-- Name: trg_field_configs_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_field_configs_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


--
-- Name: update_customers_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_customers_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


--
-- Name: update_transactions_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_transactions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    room_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    type public.message_type DEFAULT 'text'::public.message_type NOT NULL,
    content text,
    content_locale public.user_locale,
    attachment_id uuid,
    reply_to_id uuid,
    edited_at timestamp with time zone,
    deleted_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: _hyper_1_1_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_1_chunk (
    CONSTRAINT constraint_1 CHECK (((created_at >= '2026-05-21 00:00:00+00'::timestamp with time zone) AND (created_at < '2026-05-28 00:00:00+00'::timestamp with time zone)))
)
INHERITS (public.messages);


--
-- Name: _hyper_1_2_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_2_chunk (
    CONSTRAINT constraint_2 CHECK (((created_at >= '2026-05-28 00:00:00+00'::timestamp with time zone) AND (created_at < '2026-06-04 00:00:00+00'::timestamp with time zone)))
)
INHERITS (public.messages);


--
-- Name: _hyper_1_3_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_3_chunk (
    CONSTRAINT constraint_3 CHECK (((created_at >= '2026-06-04 00:00:00+00'::timestamp with time zone) AND (created_at < '2026-06-11 00:00:00+00'::timestamp with time zone)))
)
INHERITS (public.messages);


--
-- Name: attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attachments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    uploader_id uuid NOT NULL,
    storage_key character varying(512) NOT NULL,
    mime_type character varying(128) NOT NULL,
    file_name character varying(512) NOT NULL,
    size_bytes bigint NOT NULL,
    width integer,
    height integer,
    duration_ms integer,
    thumbnail_key character varying(512),
    checksum character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    actor_id uuid,
    action character varying(128) NOT NULL,
    target_type character varying(64),
    target_id uuid,
    payload jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bot_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bot_configs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(128) NOT NULL,
    type character varying(32) NOT NULL,
    enabled boolean DEFAULT false,
    config jsonb DEFAULT '{}'::jsonb,
    fallback_to_human boolean DEFAULT true,
    handoff_keywords text[] DEFAULT ARRAY['operator'::text, '╨╛╨┐╨╡╤Ç╨░╤é╨╛╤Ç'::text, 'odam'::text, '╤ç╨╡╨╗╨╛╨▓╨╡╨║'::text],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: call_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_queue (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    call_id uuid NOT NULL,
    priority smallint DEFAULT 0 NOT NULL,
    required_skills text[] DEFAULT '{}'::text[],
    required_language public.user_locale,
    enqueued_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_at timestamp with time zone,
    assigned_to uuid
);


--
-- Name: call_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_transfers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    call_id uuid NOT NULL,
    from_operator uuid NOT NULL,
    to_operator uuid NOT NULL,
    type public.transfer_type NOT NULL,
    status public.transfer_status DEFAULT 'initiated'::public.transfer_status NOT NULL,
    consult_room character varying(255),
    initiated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calls (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    caller_id uuid,
    callee_id uuid,
    direction public.call_direction NOT NULL,
    status public.call_status DEFAULT 'initiating'::public.call_status NOT NULL,
    livekit_room character varying(255),
    queue_wait_ms integer,
    ring_duration_ms integer,
    talk_duration_ms integer,
    hangup_cause character varying(64),
    hangup_by uuid,
    recording_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    initiated_at timestamp with time zone DEFAULT now() NOT NULL,
    answered_at timestamp with time zone,
    ended_at timestamp with time zone,
    product_id uuid,
    operator_id uuid
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    product_id uuid NOT NULL,
    user_id uuid,
    external_uid character varying(128),
    profile_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.devices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    platform public.device_platform NOT NULL,
    push_token text NOT NULL,
    voip_token text,
    device_name character varying(255),
    app_version character varying(32),
    locale public.user_locale,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: field_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.field_configs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    product_id uuid NOT NULL,
    context character varying(32) NOT NULL,
    field_key character varying(128) NOT NULL,
    label character varying(255) NOT NULL,
    visible boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    display_type character varying(32) DEFAULT 'text'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: message_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_receipts (
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone
);


--
-- Name: operator_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operator_products (
    user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: operator_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operator_states (
    user_id uuid NOT NULL,
    status public.operator_status DEFAULT 'offline'::public.operator_status NOT NULL,
    active_chats integer DEFAULT 0 NOT NULL,
    max_concurrent_chats integer DEFAULT 5 NOT NULL,
    on_call boolean DEFAULT false NOT NULL,
    current_call_id uuid,
    last_status_at timestamp with time zone DEFAULT now() NOT NULL,
    skills text[] DEFAULT '{}'::text[],
    languages public.user_locale[] DEFAULT '{uz}'::public.user_locale[],
    is_supervisor boolean DEFAULT false,
    current_product_id uuid
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(64) NOT NULL,
    branding jsonb DEFAULT '{}'::jsonb NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recordings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recordings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    call_id uuid NOT NULL,
    started_by uuid NOT NULL,
    consent_announced boolean DEFAULT false NOT NULL,
    status public.recording_status DEFAULT 'starting'::public.recording_status NOT NULL,
    storage_key character varying(512),
    duration_ms integer,
    size_bytes bigint,
    egress_id character varying(255),
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    stopped_at timestamp with time zone,
    failed_reason text
);


--
-- Name: room_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.room_members (
    room_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    left_at timestamp with time zone,
    last_read_message_id uuid,
    muted boolean DEFAULT false
);


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rooms (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    type public.room_type NOT NULL,
    status public.room_status DEFAULT 'open'::public.room_status NOT NULL,
    title character varying(255),
    customer_id uuid,
    operator_id uuid,
    previous_operator_id uuid,
    last_message_at timestamp with time zone,
    bot_handled boolean DEFAULT false,
    escalated_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    product_id uuid,
    tag_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL
);


--
-- Name: system_message_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_message_templates (
    key character varying(64) NOT NULL,
    template_uz text NOT NULL,
    template_ru text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    product_id uuid NOT NULL,
    name character varying(64) NOT NULL,
    color character varying(16) DEFAULT '#6B7280'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    product_id uuid NOT NULL,
    external_id character varying(128),
    user_uid character varying(128),
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    external_id character varying(64),
    phone character varying(32),
    email character varying(255),
    password_hash character varying(255),
    full_name character varying(255),
    avatar_url text,
    role public.user_role DEFAULT 'customer'::public.user_role NOT NULL,
    status public.user_status DEFAULT 'active'::public.user_status NOT NULL,
    locale public.user_locale DEFAULT 'uz'::public.user_locale NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: _hyper_1_1_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk ALTER COLUMN id SET DEFAULT public.uuid_generate_v4();


--
-- Name: _hyper_1_1_chunk type; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk ALTER COLUMN type SET DEFAULT 'text'::public.message_type;


--
-- Name: _hyper_1_1_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_1_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_2_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk ALTER COLUMN id SET DEFAULT public.uuid_generate_v4();


--
-- Name: _hyper_1_2_chunk type; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk ALTER COLUMN type SET DEFAULT 'text'::public.message_type;


--
-- Name: _hyper_1_2_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_2_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_3_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk ALTER COLUMN id SET DEFAULT public.uuid_generate_v4();


--
-- Name: _hyper_1_3_chunk type; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk ALTER COLUMN type SET DEFAULT 'text'::public.message_type;


--
-- Name: _hyper_1_3_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_3_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_1_chunk 1_1_messages_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk
    ADD CONSTRAINT "1_1_messages_pkey" PRIMARY KEY (id, created_at);


--
-- Name: _hyper_1_2_chunk 2_2_messages_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk
    ADD CONSTRAINT "2_2_messages_pkey" PRIMARY KEY (id, created_at);


--
-- Name: _hyper_1_3_chunk 3_3_messages_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk
    ADD CONSTRAINT "3_3_messages_pkey" PRIMARY KEY (id, created_at);


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: bot_configs bot_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_configs
    ADD CONSTRAINT bot_configs_pkey PRIMARY KEY (id);


--
-- Name: call_queue call_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_queue
    ADD CONSTRAINT call_queue_pkey PRIMARY KEY (id);


--
-- Name: call_transfers call_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_transfers
    ADD CONSTRAINT call_transfers_pkey PRIMARY KEY (id);


--
-- Name: calls calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: customers customers_product_id_external_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_product_id_external_uid_key UNIQUE (product_id, external_uid);


--
-- Name: customers customers_product_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_product_id_user_id_key UNIQUE (product_id, user_id);


--
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (id);


--
-- Name: devices devices_user_id_push_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_user_id_push_token_key UNIQUE (user_id, push_token);


--
-- Name: field_configs field_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_configs
    ADD CONSTRAINT field_configs_pkey PRIMARY KEY (id);


--
-- Name: field_configs field_configs_product_id_context_field_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_configs
    ADD CONSTRAINT field_configs_product_id_context_field_key_key UNIQUE (product_id, context, field_key);


--
-- Name: message_receipts message_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_receipts
    ADD CONSTRAINT message_receipts_pkey PRIMARY KEY (message_id, user_id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, created_at);


--
-- Name: operator_products operator_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_products
    ADD CONSTRAINT operator_products_pkey PRIMARY KEY (user_id, product_id);


--
-- Name: operator_states operator_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_states
    ADD CONSTRAINT operator_states_pkey PRIMARY KEY (user_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_slug_key UNIQUE (slug);


--
-- Name: recordings recordings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT recordings_pkey PRIMARY KEY (id);


--
-- Name: room_members room_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_members
    ADD CONSTRAINT room_members_pkey PRIMARY KEY (room_id, user_id);


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- Name: system_message_templates system_message_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_message_templates
    ADD CONSTRAINT system_message_templates_pkey PRIMARY KEY (key);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: tags tags_product_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_product_id_name_key UNIQUE (product_id, name);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_product_id_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_product_id_external_id_key UNIQUE (product_id, external_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_external_id_key UNIQUE (external_id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: _hyper_1_1_chunk_idx_messages_attachment_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1_chunk_idx_messages_attachment_id ON _timescaledb_internal._hyper_1_1_chunk USING btree (attachment_id) WHERE (attachment_id IS NOT NULL);


--
-- Name: _hyper_1_1_chunk_idx_messages_room; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1_chunk_idx_messages_room ON _timescaledb_internal._hyper_1_1_chunk USING btree (room_id, created_at DESC);


--
-- Name: _hyper_1_1_chunk_idx_messages_sender; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1_chunk_idx_messages_sender ON _timescaledb_internal._hyper_1_1_chunk USING btree (sender_id, created_at DESC);


--
-- Name: _hyper_1_1_chunk_messages_created_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1_chunk_messages_created_at_idx ON _timescaledb_internal._hyper_1_1_chunk USING btree (created_at DESC);


--
-- Name: _hyper_1_2_chunk_idx_messages_attachment_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_2_chunk_idx_messages_attachment_id ON _timescaledb_internal._hyper_1_2_chunk USING btree (attachment_id) WHERE (attachment_id IS NOT NULL);


--
-- Name: _hyper_1_2_chunk_idx_messages_room; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_2_chunk_idx_messages_room ON _timescaledb_internal._hyper_1_2_chunk USING btree (room_id, created_at DESC);


--
-- Name: _hyper_1_2_chunk_idx_messages_sender; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_2_chunk_idx_messages_sender ON _timescaledb_internal._hyper_1_2_chunk USING btree (sender_id, created_at DESC);


--
-- Name: _hyper_1_2_chunk_messages_created_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_2_chunk_messages_created_at_idx ON _timescaledb_internal._hyper_1_2_chunk USING btree (created_at DESC);


--
-- Name: _hyper_1_3_chunk_idx_messages_attachment_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_3_chunk_idx_messages_attachment_id ON _timescaledb_internal._hyper_1_3_chunk USING btree (attachment_id) WHERE (attachment_id IS NOT NULL);


--
-- Name: _hyper_1_3_chunk_idx_messages_room; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_3_chunk_idx_messages_room ON _timescaledb_internal._hyper_1_3_chunk USING btree (room_id, created_at DESC);


--
-- Name: _hyper_1_3_chunk_idx_messages_sender; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_3_chunk_idx_messages_sender ON _timescaledb_internal._hyper_1_3_chunk USING btree (sender_id, created_at DESC);


--
-- Name: _hyper_1_3_chunk_messages_created_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_3_chunk_messages_created_at_idx ON _timescaledb_internal._hyper_1_3_chunk USING btree (created_at DESC);


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.audit_logs USING btree (action, created_at DESC);


--
-- Name: idx_audit_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_actor ON public.audit_logs USING btree (actor_id, created_at DESC);


--
-- Name: idx_call_transfers_call; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_transfers_call ON public.call_transfers USING btree (call_id);


--
-- Name: idx_calls_callee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_callee ON public.calls USING btree (callee_id, initiated_at DESC);


--
-- Name: idx_calls_caller; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_caller ON public.calls USING btree (caller_id, initiated_at DESC);


--
-- Name: idx_calls_operator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_operator ON public.calls USING btree (operator_id);


--
-- Name: idx_calls_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_product ON public.calls USING btree (product_id);


--
-- Name: idx_calls_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calls_status ON public.calls USING btree (status) WHERE (status = ANY (ARRAY['queued'::public.call_status, 'ringing'::public.call_status, 'connected'::public.call_status, 'on_hold'::public.call_status]));


--
-- Name: idx_customers_ext_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_ext_uid ON public.customers USING btree (product_id, external_uid);


--
-- Name: idx_customers_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_product ON public.customers USING btree (product_id);


--
-- Name: idx_customers_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_user ON public.customers USING btree (user_id);


--
-- Name: idx_devices_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_devices_user ON public.devices USING btree (user_id);


--
-- Name: idx_field_configs_product_ctx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_field_configs_product_ctx ON public.field_configs USING btree (product_id, context);


--
-- Name: idx_messages_attachment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_attachment_id ON public.messages USING btree (attachment_id) WHERE (attachment_id IS NOT NULL);


--
-- Name: idx_messages_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_room ON public.messages USING btree (room_id, created_at DESC);


--
-- Name: idx_messages_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sender ON public.messages USING btree (sender_id, created_at DESC);


--
-- Name: idx_operator_products_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_products_product ON public.operator_products USING btree (product_id);


--
-- Name: idx_operator_products_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_products_user ON public.operator_products USING btree (user_id);


--
-- Name: idx_operator_states_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_operator_states_status ON public.operator_states USING btree (status) WHERE (status <> 'offline'::public.operator_status);


--
-- Name: idx_queue_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_queue_pending ON public.call_queue USING btree (priority DESC, enqueued_at) WHERE (assigned_at IS NULL);


--
-- Name: idx_recordings_call; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recordings_call ON public.recordings USING btree (call_id);


--
-- Name: idx_rooms_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rooms_customer ON public.rooms USING btree (customer_id);


--
-- Name: idx_rooms_operator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rooms_operator ON public.rooms USING btree (operator_id) WHERE (status = 'open'::public.room_status);


--
-- Name: idx_rooms_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rooms_product ON public.rooms USING btree (product_id);


--
-- Name: idx_rooms_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rooms_status ON public.rooms USING btree (status, last_message_at DESC);


--
-- Name: idx_rooms_tag_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rooms_tag_ids ON public.rooms USING gin (tag_ids);


--
-- Name: idx_tags_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tags_product ON public.tags USING btree (product_id);


--
-- Name: idx_transactions_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_product ON public.transactions USING btree (product_id, created_at DESC);


--
-- Name: idx_transactions_user_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_user_uid ON public.transactions USING btree (product_id, user_uid);


--
-- Name: idx_users_external; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_external ON public.users USING btree (external_id);


--
-- Name: idx_users_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_phone ON public.users USING btree (phone) WHERE (status = 'active'::public.user_status);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role) WHERE (status = 'active'::public.user_status);


--
-- Name: messages_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_created_at_idx ON public.messages USING btree (created_at DESC);


--
-- Name: uniq_active_support_per_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_active_support_per_customer ON public.rooms USING btree (customer_id, COALESCE(product_id, '00000000-0000-0000-0000-000000000001'::uuid)) WHERE ((type = 'support'::public.room_type) AND (status = ANY (ARRAY['open'::public.room_status, 'pending'::public.room_status])));


--
-- Name: customers trg_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_customers_updated_at();


--
-- Name: field_configs trg_field_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_field_configs_updated_at BEFORE UPDATE ON public.field_configs FOR EACH ROW EXECUTE FUNCTION public.trg_field_configs_updated_at();


--
-- Name: transactions trg_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_transactions_updated_at();


--
-- Name: attachments attachments_uploader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_uploader_id_fkey FOREIGN KEY (uploader_id) REFERENCES public.users(id);


--
-- Name: audit_logs audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: call_queue call_queue_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_queue
    ADD CONSTRAINT call_queue_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: call_queue call_queue_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_queue
    ADD CONSTRAINT call_queue_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id) ON DELETE CASCADE;


--
-- Name: call_transfers call_transfers_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_transfers
    ADD CONSTRAINT call_transfers_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id) ON DELETE CASCADE;


--
-- Name: call_transfers call_transfers_from_operator_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_transfers
    ADD CONSTRAINT call_transfers_from_operator_fkey FOREIGN KEY (from_operator) REFERENCES public.users(id);


--
-- Name: call_transfers call_transfers_to_operator_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_transfers
    ADD CONSTRAINT call_transfers_to_operator_fkey FOREIGN KEY (to_operator) REFERENCES public.users(id);


--
-- Name: calls calls_callee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_callee_id_fkey FOREIGN KEY (callee_id) REFERENCES public.users(id);


--
-- Name: calls calls_caller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_caller_id_fkey FOREIGN KEY (caller_id) REFERENCES public.users(id);


--
-- Name: calls calls_hangup_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_hangup_by_fkey FOREIGN KEY (hangup_by) REFERENCES public.users(id);


--
-- Name: calls calls_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.users(id);


--
-- Name: calls calls_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calls
    ADD CONSTRAINT calls_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: customers customers_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: customers customers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: devices devices_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: field_configs field_configs_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.field_configs
    ADD CONSTRAINT field_configs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: message_receipts message_receipts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_receipts
    ADD CONSTRAINT message_receipts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: operator_products operator_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_products
    ADD CONSTRAINT operator_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: operator_products operator_products_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_products
    ADD CONSTRAINT operator_products_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: operator_states operator_states_current_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_states
    ADD CONSTRAINT operator_states_current_product_id_fkey FOREIGN KEY (current_product_id) REFERENCES public.products(id);


--
-- Name: operator_states operator_states_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_states
    ADD CONSTRAINT operator_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: recordings recordings_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT recordings_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.calls(id) ON DELETE CASCADE;


--
-- Name: recordings recordings_started_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT recordings_started_by_fkey FOREIGN KEY (started_by) REFERENCES public.users(id);


--
-- Name: room_members room_members_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_members
    ADD CONSTRAINT room_members_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE;


--
-- Name: room_members room_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_members
    ADD CONSTRAINT room_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: rooms rooms_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id);


--
-- Name: rooms rooms_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.users(id);


--
-- Name: rooms rooms_previous_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_previous_operator_id_fkey FOREIGN KEY (previous_operator_id) REFERENCES public.users(id);


--
-- Name: rooms rooms_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: tags tags_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 54G7gldvNjEL8DxHQHa9CK78iBXlxY2MZNCHnWQV5AWEc8eN0lcus1M2hQvSJDf

