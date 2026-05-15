--
-- PostgreSQL database dump
--

\restrict qlddhA4gekhO6nOTfv7K4YuToMpC9LbDDltg3BVTCK3w6R23F1OJmGGT0F4vFSa

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

-- Started on 2026-05-15 11:06:13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 4 (class 3079 OID 16506)
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- TOC entry 5602 (class 0 OID 0)
-- Dependencies: 4
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- TOC entry 3 (class 3079 OID 16401)
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- TOC entry 5603 (class 0 OID 0)
-- Dependencies: 3
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- TOC entry 2 (class 3079 OID 16390)
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- TOC entry 5604 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- TOC entry 357 (class 1255 OID 17589)
-- Name: sync_unit_status_on_lease_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_unit_status_on_lease_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.status = 'active' THEN
        UPDATE units SET status = 'occupied' WHERE id = NEW.unit_id;
    ELSIF NEW.status IN ('expired', 'terminated') THEN
        UPDATE units SET status = 'vacant' WHERE id = NEW.unit_id;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_unit_status_on_lease_change() OWNER TO postgres;

--
-- TOC entry 398 (class 1255 OID 17585)
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 231 (class 1259 OID 17527)
-- Name: expenses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.expenses (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    property_id uuid NOT NULL,
    category character varying(50) NOT NULL,
    amount numeric(12,2) NOT NULL,
    description text NOT NULL,
    expense_date date NOT NULL,
    vendor_name character varying(200),
    receipt_reference character varying(100),
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expenses_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT expenses_category_check CHECK (((category)::text = ANY ((ARRAY['repair'::character varying, 'maintenance'::character varying, 'insurance'::character varying, 'rates'::character varying, 'management_fee'::character varying, 'utility'::character varying, 'legal'::character varying, 'other'::character varying])::text[])))
);


ALTER TABLE public.expenses OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 17347)
-- Name: leases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.leases (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date,
    monthly_rent numeric(12,2) NOT NULL,
    deposit_amount numeric(12,2) DEFAULT 0 NOT NULL,
    balance_due numeric(12,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    is_in_arrears boolean DEFAULT false NOT NULL,
    arrears_days integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leases_check CHECK (((end_date IS NULL) OR (end_date > start_date))),
    CONSTRAINT leases_deposit_amount_check CHECK ((deposit_amount >= (0)::numeric)),
    CONSTRAINT leases_monthly_rent_check CHECK ((monthly_rent > (0)::numeric)),
    CONSTRAINT leases_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'expired'::character varying, 'terminated'::character varying, 'pending'::character varying])::text[])))
);


ALTER TABLE public.leases OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 17490)
-- Name: maintenance_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.maintenance_requests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    description text NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    assigned_to character varying(200),
    estimated_cost numeric(12,2),
    actual_cost numeric(12,2),
    resolution_notes text,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT maintenance_requests_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'emergency'::character varying])::text[]))),
    CONSTRAINT maintenance_requests_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'in_progress'::character varying, 'resolved'::character varying, 'closed'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.maintenance_requests OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 17560)
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    notification_type character varying(50) NOT NULL,
    title character varying(200) NOT NULL,
    message text NOT NULL,
    related_object_id uuid,
    related_object_type character varying(50),
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_notification_type_check CHECK (((notification_type)::text = ANY ((ARRAY['rent_due'::character varying, 'rent_overdue'::character varying, 'payment_received'::character varying, 'maintenance_update'::character varying, 'utility_bill'::character varying, 'lease_expiry'::character varying, 'general'::character varying])::text[])))
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 17392)
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    lease_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    balance_before numeric(12,2) NOT NULL,
    balance_after numeric(12,2) NOT NULL,
    payment_method character varying(50) NOT NULL,
    reference_number character varying(100),
    payment_date date NOT NULL,
    period_month date,
    notes text,
    recorded_by uuid,
    status character varying(20) DEFAULT 'confirmed'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payments_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['cash'::character varying, 'bank_transfer'::character varying, 'mobile_money'::character varying, 'cheque'::character varying])::text[]))),
    CONSTRAINT payments_status_check CHECK (((status)::text = ANY ((ARRAY['confirmed'::character varying, 'pending'::character varying, 'reversed'::character varying])::text[])))
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 17261)
-- Name: properties; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.properties (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    owner_id uuid NOT NULL,
    name character varying(200) NOT NULL,
    address text NOT NULL,
    city character varying(100) DEFAULT 'Lusaka'::character varying NOT NULL,
    district character varying(100),
    property_type character varying(50) NOT NULL,
    total_units integer DEFAULT 1 NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT properties_property_type_check CHECK (((property_type)::text = ANY ((ARRAY['residential'::character varying, 'commercial'::character varying, 'mixed'::character varying])::text[]))),
    CONSTRAINT properties_total_units_check CHECK ((total_units > 0))
);


ALTER TABLE public.properties OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 17323)
-- Name: tenants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tenants (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    nrc_number character varying(20),
    emergency_contact character varying(200),
    emergency_phone character varying(20),
    employer_name character varying(200),
    employer_phone character varying(20),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tenants OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 17290)
-- Name: units; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.units (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    property_id uuid NOT NULL,
    unit_number character varying(20) NOT NULL,
    unit_type character varying(50) NOT NULL,
    floor_area_sqm numeric(8,2),
    bedrooms integer DEFAULT 1 NOT NULL,
    bathrooms integer DEFAULT 1 NOT NULL,
    rent_amount numeric(12,2) NOT NULL,
    status character varying(20) DEFAULT 'vacant'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT units_rent_amount_check CHECK ((rent_amount >= (0)::numeric)),
    CONSTRAINT units_status_check CHECK (((status)::text = ANY ((ARRAY['vacant'::character varying, 'occupied'::character varying, 'under_maintenance'::character varying])::text[]))),
    CONSTRAINT units_unit_type_check CHECK (((unit_type)::text = ANY ((ARRAY['studio'::character varying, '1br'::character varying, '2br'::character varying, '3br'::character varying, 'commercial'::character varying, 'other'::character varying])::text[])))
);


ALTER TABLE public.units OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 17236)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email public.citext NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    phone character varying(20),
    is_active boolean DEFAULT true NOT NULL,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'landlord'::character varying, 'tenant'::character varying])::text[])))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 17461)
-- Name: utility_allocations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.utility_allocations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    bill_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    allocated_amount numeric(12,2) NOT NULL,
    allocation_basis numeric(8,4),
    is_paid boolean DEFAULT false NOT NULL,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT utility_allocations_allocated_amount_check CHECK ((allocated_amount >= (0)::numeric))
);


ALTER TABLE public.utility_allocations OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 17427)
-- Name: utility_bills; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.utility_bills (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    property_id uuid NOT NULL,
    utility_type character varying(50) NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    split_method character varying(30) DEFAULT 'equal'::character varying NOT NULL,
    billing_period date NOT NULL,
    due_date date,
    invoice_number character varying(100),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT utility_bills_split_method_check CHECK (((split_method)::text = ANY ((ARRAY['equal'::character varying, 'by_area'::character varying, 'by_occupants'::character varying, 'custom'::character varying])::text[]))),
    CONSTRAINT utility_bills_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'split'::character varying, 'paid'::character varying, 'overdue'::character varying])::text[]))),
    CONSTRAINT utility_bills_total_amount_check CHECK ((total_amount > (0)::numeric)),
    CONSTRAINT utility_bills_utility_type_check CHECK (((utility_type)::text = ANY ((ARRAY['electricity'::character varying, 'water'::character varying, 'internet'::character varying, 'garbage'::character varying, 'other'::character varying])::text[])))
);


ALTER TABLE public.utility_bills OWNER TO postgres;

--
-- TOC entry 5595 (class 0 OID 17527)
-- Dependencies: 231
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.expenses (id, property_id, category, amount, description, expense_date, vendor_name, receipt_reference, recorded_by, created_at, updated_at) FROM stdin;
aaaaaaaa-0000-0000-0000-000000000001	22222222-0000-0000-0000-000000000001	repair	320.00	Socket replacement Unit A3	2025-03-10	Copperbelt Electricals	RCP-3201	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
aaaaaaaa-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000001	maintenance	150.00	General cleaning common areas	2025-03-05	CleanZam Services	RCP-1501	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
aaaaaaaa-0000-0000-0000-000000000003	22222222-0000-0000-0000-000000000002	rates	480.00	LCC rates Q1 2025	2025-01-15	Lusaka City Council	LCC-0125	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
aaaaaaaa-0000-0000-0000-000000000004	22222222-0000-0000-0000-000000000001	insurance	900.00	Building insurance premium 2025	2025-01-02	Madison Insurance	MAD-0012	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
\.


--
-- TOC entry 5590 (class 0 OID 17347)
-- Dependencies: 226
-- Data for Name: leases; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.leases (id, tenant_id, unit_id, start_date, end_date, monthly_rent, deposit_amount, balance_due, status, is_in_arrears, arrears_days, created_at, updated_at) FROM stdin;
55555555-0000-0000-0000-000000000001	44444444-0000-0000-0000-000000000001	33333333-0000-0000-0000-000000000001	2024-01-01	\N	3500.00	3500.00	0.00	active	f	0	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
55555555-0000-0000-0000-000000000002	44444444-0000-0000-0000-000000000002	33333333-0000-0000-0000-000000000002	2024-02-01	\N	2800.00	2800.00	2800.00	active	t	18	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
55555555-0000-0000-0000-000000000003	44444444-0000-0000-0000-000000000003	33333333-0000-0000-0000-000000000003	2024-03-01	\N	4500.00	4500.00	1500.00	active	t	9	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
55555555-0000-0000-0000-000000000004	44444444-0000-0000-0000-000000000004	33333333-0000-0000-0000-000000000005	2024-01-15	\N	3200.00	3200.00	0.00	active	f	0	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
\.


--
-- TOC entry 5594 (class 0 OID 17490)
-- Dependencies: 230
-- Data for Name: maintenance_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.maintenance_requests (id, tenant_id, unit_id, title, description, priority, status, assigned_to, estimated_cost, actual_cost, resolution_notes, resolved_at, created_at, updated_at) FROM stdin;
99999999-0000-0000-0000-000000000001	44444444-0000-0000-0000-000000000001	33333333-0000-0000-0000-000000000001	Burst water pipe in kitchen	Water leaking under sink — urgent	emergency	in_progress	Kalinda Plumbing	800.00	\N	\N	\N	2026-03-20 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
99999999-0000-0000-0000-000000000002	44444444-0000-0000-0000-000000000002	33333333-0000-0000-0000-000000000002	Broken window latch	Bedroom window will not lock	low	open	\N	80.00	\N	\N	\N	2026-03-18 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
99999999-0000-0000-0000-000000000003	44444444-0000-0000-0000-000000000003	33333333-0000-0000-0000-000000000003	Electrical socket sparking	Socket in lounge is dangerous	high	resolved	Copperbelt Electricals	350.00	320.00	Socket replaced, tested safe	2026-03-22 14:25:08.100608+02	2026-03-16 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
99999999-0000-0000-0000-000000000004	44444444-0000-0000-0000-000000000004	33333333-0000-0000-0000-000000000005	Ceiling fan not working	Fan stopped spinning completely	medium	open	\N	150.00	\N	\N	\N	2026-03-21 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
\.


--
-- TOC entry 5596 (class 0 OID 17560)
-- Dependencies: 232
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, user_id, notification_type, title, message, related_object_id, related_object_type, is_read, created_at) FROM stdin;
bbbbbbbb-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000001	rent_overdue	Rent Overdue — Mwansa Kapambwe	ZMW 2,800 outstanding for Unit A2. 18 days overdue.	\N	\N	f	2026-03-22 14:25:08.100608+02
bbbbbbbb-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000001	rent_overdue	Rent Overdue — Bwalya Nkonde	ZMW 1,500 outstanding for Unit A3. 9 days overdue.	\N	\N	f	2026-03-21 14:25:08.100608+02
bbbbbbbb-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000002	payment_received	Payment Received	ZMW 3,500 received for Unit A1. Balance: ZMW 0.00.	\N	\N	t	2026-03-18 14:25:08.100608+02
bbbbbbbb-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000003	utility_bill	Electricity Bill — March 2025	Your share of the electricity bill is ZMW 413.33.	\N	\N	f	2026-03-20 14:25:08.100608+02
bbbbbbbb-0000-0000-0000-000000000005	11111111-0000-0000-0000-000000000001	maintenance_update	Maintenance Emergency — Unit A1	Burst pipe reported. Kalinda Plumbing has been assigned.	\N	\N	f	2026-03-20 14:25:08.100608+02
\.


--
-- TOC entry 5591 (class 0 OID 17392)
-- Dependencies: 227
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payments (id, lease_id, amount, balance_before, balance_after, payment_method, reference_number, payment_date, period_month, notes, recorded_by, status, created_at) FROM stdin;
66666666-0000-0000-0000-000000000001	55555555-0000-0000-0000-000000000001	3500.00	3500.00	0.00	mobile_money	MTN-10001	2026-01-02	\N	\N	\N	confirmed	2026-03-23 14:25:08.100608+02
66666666-0000-0000-0000-000000000002	55555555-0000-0000-0000-000000000001	3500.00	3500.00	0.00	mobile_money	MTN-10002	2026-02-03	\N	\N	\N	confirmed	2026-03-23 14:25:08.100608+02
66666666-0000-0000-0000-000000000003	55555555-0000-0000-0000-000000000001	3500.00	3500.00	0.00	bank_transfer	ZNB-10003	2026-03-01	\N	\N	\N	confirmed	2026-03-23 14:25:08.100608+02
66666666-0000-0000-0000-000000000004	55555555-0000-0000-0000-000000000002	2800.00	2800.00	0.00	cash		2026-01-05	\N	\N	\N	confirmed	2026-03-23 14:25:08.100608+02
66666666-0000-0000-0000-000000000005	55555555-0000-0000-0000-000000000002	2800.00	2800.00	0.00	mobile_money	AIR-10005	2026-02-04	\N	\N	\N	confirmed	2026-03-23 14:25:08.100608+02
66666666-0000-0000-0000-000000000006	55555555-0000-0000-0000-000000000003	4500.00	4500.00	0.00	cash		2026-01-03	\N	\N	\N	confirmed	2026-03-23 14:25:08.100608+02
66666666-0000-0000-0000-000000000007	55555555-0000-0000-0000-000000000003	3000.00	4500.00	1500.00	cash		2026-03-08	\N	\N	\N	confirmed	2026-03-23 14:25:08.100608+02
66666666-0000-0000-0000-000000000008	55555555-0000-0000-0000-000000000004	3200.00	3200.00	0.00	bank_transfer	ZNB-10008	2026-01-02	\N	\N	\N	confirmed	2026-03-23 14:25:08.100608+02
66666666-0000-0000-0000-000000000009	55555555-0000-0000-0000-000000000004	3200.00	3200.00	0.00	bank_transfer	ZNB-10009	2026-02-01	\N	\N	\N	confirmed	2026-03-23 14:25:08.100608+02
66666666-0000-0000-0000-000000000010	55555555-0000-0000-0000-000000000004	3200.00	3200.00	0.00	mobile_money	MTN-10010	2026-03-02	\N	\N	\N	confirmed	2026-03-23 14:25:08.100608+02
\.


--
-- TOC entry 5587 (class 0 OID 17261)
-- Dependencies: 223
-- Data for Name: properties; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.properties (id, owner_id, name, address, city, district, property_type, total_units, description, created_at, updated_at) FROM stdin;
22222222-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000001	Kabulonga Heights	15 Independence Ave	Lusaka	Kabulonga	residential	4	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
22222222-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000001	Woodlands Block B	7 Nationalist Road	Lusaka	Woodlands	residential	3	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
22222222-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000001	Cairo Road Commercial	21 Cairo Road	Lusaka	Central	commercial	2	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
\.


--
-- TOC entry 5589 (class 0 OID 17323)
-- Dependencies: 225
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tenants (id, user_id, nrc_number, emergency_contact, emergency_phone, employer_name, employer_phone, notes, created_at, updated_at) FROM stdin;
44444444-0000-0000-0000-000000000001	11111111-0000-0000-0000-000000000002	123456/10/1	Mary Mutale	+260 97 200 0001	\N	\N	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
44444444-0000-0000-0000-000000000002	11111111-0000-0000-0000-000000000003	234567/11/1	Peter Kapambwe	+260 96 200 0002	\N	\N	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
44444444-0000-0000-0000-000000000003	11111111-0000-0000-0000-000000000004	345678/09/1	Grace Nkonde	+260 95 200 0003	\N	\N	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
44444444-0000-0000-0000-000000000004	11111111-0000-0000-0000-000000000005	456789/12/1	John Phiri	+260 97 200 0004	\N	\N	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
\.


--
-- TOC entry 5588 (class 0 OID 17290)
-- Dependencies: 224
-- Data for Name: units; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.units (id, property_id, unit_number, unit_type, floor_area_sqm, bedrooms, bathrooms, rent_amount, status, created_at, updated_at) FROM stdin;
33333333-0000-0000-0000-000000000004	22222222-0000-0000-0000-000000000001	A4	studio	30.00	1	1	1800.00	vacant	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
33333333-0000-0000-0000-000000000006	22222222-0000-0000-0000-000000000002	B2	2br	60.00	2	1	3200.00	vacant	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
33333333-0000-0000-0000-000000000007	22222222-0000-0000-0000-000000000002	B3	1br	40.00	1	1	2500.00	occupied	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
33333333-0000-0000-0000-000000000008	22222222-0000-0000-0000-000000000003	S1	commercial	80.00	0	1	6000.00	occupied	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
33333333-0000-0000-0000-000000000009	22222222-0000-0000-0000-000000000003	S2	commercial	80.00	0	1	6000.00	vacant	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
33333333-0000-0000-0000-000000000001	22222222-0000-0000-0000-000000000001	A1	2br	65.00	2	1	3500.00	occupied	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
33333333-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000001	A2	1br	45.00	1	1	2800.00	occupied	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
33333333-0000-0000-0000-000000000003	22222222-0000-0000-0000-000000000001	A3	3br	90.00	3	2	4500.00	occupied	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
33333333-0000-0000-0000-000000000005	22222222-0000-0000-0000-000000000002	B1	2br	60.00	2	1	3200.00	occupied	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
\.


--
-- TOC entry 5586 (class 0 OID 17236)
-- Dependencies: 222
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, password_hash, role, first_name, last_name, phone, is_active, last_login, created_at, updated_at) FROM stdin;
11111111-0000-0000-0000-000000000001	james@test.com	hashed_password	landlord	James	Mwale	+260 97 100 0001	t	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
11111111-0000-0000-0000-000000000002	chanda@test.com	hashed_password	tenant	Chanda	Mutale	+260 97 100 0002	t	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
11111111-0000-0000-0000-000000000003	mwansa@test.com	hashed_password	tenant	Mwansa	Kapambwe	+260 96 100 0003	t	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
11111111-0000-0000-0000-000000000004	bwalya@test.com	hashed_password	tenant	Bwalya	Nkonde	+260 95 100 0004	t	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
11111111-0000-0000-0000-000000000005	mutinta@test.com	hashed_password	tenant	Mutinta	Phiri	+260 97 100 0005	t	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
\.


--
-- TOC entry 5593 (class 0 OID 17461)
-- Dependencies: 229
-- Data for Name: utility_allocations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.utility_allocations (id, bill_id, unit_id, allocated_amount, allocation_basis, is_paid, paid_at, created_at) FROM stdin;
88888888-0000-0000-0000-000000000001	77777777-0000-0000-0000-000000000001	33333333-0000-0000-0000-000000000001	413.34	0.3333	f	\N	2026-03-23 14:25:08.100608+02
88888888-0000-0000-0000-000000000002	77777777-0000-0000-0000-000000000001	33333333-0000-0000-0000-000000000002	413.33	0.3333	f	\N	2026-03-23 14:25:08.100608+02
88888888-0000-0000-0000-000000000003	77777777-0000-0000-0000-000000000001	33333333-0000-0000-0000-000000000003	413.33	0.3333	t	\N	2026-03-23 14:25:08.100608+02
\.


--
-- TOC entry 5592 (class 0 OID 17427)
-- Dependencies: 228
-- Data for Name: utility_bills; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.utility_bills (id, property_id, utility_type, total_amount, split_method, billing_period, due_date, invoice_number, status, notes, created_at, updated_at) FROM stdin;
77777777-0000-0000-0000-000000000001	22222222-0000-0000-0000-000000000001	electricity	1240.00	equal	2025-03-01	2025-03-20	ZESCO-2503-001	split	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
77777777-0000-0000-0000-000000000002	22222222-0000-0000-0000-000000000001	water	420.00	by_area	2025-03-01	2025-03-25	LWSC-2503-001	pending	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
77777777-0000-0000-0000-000000000003	22222222-0000-0000-0000-000000000002	electricity	860.00	equal	2025-03-01	2025-03-20	ZESCO-2503-002	split	\N	2026-03-23 14:25:08.100608+02	2026-03-23 14:25:08.100608+02
\.


--
-- TOC entry 5412 (class 2606 OID 17546)
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- TOC entry 5385 (class 2606 OID 17375)
-- Name: leases leases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leases
    ADD CONSTRAINT leases_pkey PRIMARY KEY (id);


--
-- TOC entry 5387 (class 2606 OID 17377)
-- Name: leases leases_unit_id_tsrange_excl; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leases
    ADD CONSTRAINT leases_unit_id_tsrange_excl EXCLUDE USING gist (unit_id WITH =, tsrange((start_date)::timestamp without time zone, COALESCE((end_date)::timestamp without time zone, 'infinity'::timestamp without time zone)) WITH &&) WHERE (((status)::text = 'active'::text));


--
-- TOC entry 5410 (class 2606 OID 17512)
-- Name: maintenance_requests maintenance_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.maintenance_requests
    ADD CONSTRAINT maintenance_requests_pkey PRIMARY KEY (id);


--
-- TOC entry 5419 (class 2606 OID 17577)
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- TOC entry 5392 (class 2606 OID 17413)
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- TOC entry 5366 (class 2606 OID 17283)
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- TOC entry 5375 (class 2606 OID 17340)
-- Name: tenants tenants_nrc_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_nrc_number_key UNIQUE (nrc_number);


--
-- TOC entry 5377 (class 2606 OID 17336)
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- TOC entry 5379 (class 2606 OID 17338)
-- Name: tenants tenants_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_user_id_key UNIQUE (user_id);


--
-- TOC entry 5370 (class 2606 OID 17313)
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--
-- TOC entry 5372 (class 2606 OID 17315)
-- Name: units units_property_id_unit_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_property_id_unit_number_key UNIQUE (property_id, unit_number);


--
-- TOC entry 5361 (class 2606 OID 17258)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 5363 (class 2606 OID 17256)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 5402 (class 2606 OID 17477)
-- Name: utility_allocations utility_allocations_bill_id_unit_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.utility_allocations
    ADD CONSTRAINT utility_allocations_bill_id_unit_id_key UNIQUE (bill_id, unit_id);


--
-- TOC entry 5404 (class 2606 OID 17475)
-- Name: utility_allocations utility_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.utility_allocations
    ADD CONSTRAINT utility_allocations_pkey PRIMARY KEY (id);


--
-- TOC entry 5396 (class 2606 OID 17451)
-- Name: utility_bills utility_bills_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.utility_bills
    ADD CONSTRAINT utility_bills_pkey PRIMARY KEY (id);


--
-- TOC entry 5398 (class 2606 OID 17453)
-- Name: utility_bills utility_bills_property_id_utility_type_billing_period_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.utility_bills
    ADD CONSTRAINT utility_bills_property_id_utility_type_billing_period_key UNIQUE (property_id, utility_type, billing_period);


--
-- TOC entry 5413 (class 1259 OID 17559)
-- Name: idx_expenses_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_expenses_category ON public.expenses USING btree (category);


--
-- TOC entry 5414 (class 1259 OID 17558)
-- Name: idx_expenses_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_expenses_date ON public.expenses USING btree (expense_date);


--
-- TOC entry 5415 (class 1259 OID 17557)
-- Name: idx_expenses_property; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_expenses_property ON public.expenses USING btree (property_id);


--
-- TOC entry 5380 (class 1259 OID 17391)
-- Name: idx_leases_arrears; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leases_arrears ON public.leases USING btree (is_in_arrears) WHERE (is_in_arrears = true);


--
-- TOC entry 5381 (class 1259 OID 17390)
-- Name: idx_leases_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leases_status ON public.leases USING btree (status);


--
-- TOC entry 5382 (class 1259 OID 17388)
-- Name: idx_leases_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leases_tenant ON public.leases USING btree (tenant_id);


--
-- TOC entry 5383 (class 1259 OID 17389)
-- Name: idx_leases_unit; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_leases_unit ON public.leases USING btree (unit_id);


--
-- TOC entry 5405 (class 1259 OID 17526)
-- Name: idx_maintenance_priority; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_maintenance_priority ON public.maintenance_requests USING btree (priority);


--
-- TOC entry 5406 (class 1259 OID 17525)
-- Name: idx_maintenance_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_maintenance_status ON public.maintenance_requests USING btree (status);


--
-- TOC entry 5407 (class 1259 OID 17523)
-- Name: idx_maintenance_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_maintenance_tenant ON public.maintenance_requests USING btree (tenant_id);


--
-- TOC entry 5408 (class 1259 OID 17524)
-- Name: idx_maintenance_unit; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_maintenance_unit ON public.maintenance_requests USING btree (unit_id);


--
-- TOC entry 5416 (class 1259 OID 17584)
-- Name: idx_notif_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notif_created ON public.notifications USING btree (created_at DESC);


--
-- TOC entry 5417 (class 1259 OID 17583)
-- Name: idx_notif_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notif_user ON public.notifications USING btree (user_id, is_read);


--
-- TOC entry 5388 (class 1259 OID 17425)
-- Name: idx_payments_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_date ON public.payments USING btree (payment_date);


--
-- TOC entry 5389 (class 1259 OID 17424)
-- Name: idx_payments_lease; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_lease ON public.payments USING btree (lease_id);


--
-- TOC entry 5390 (class 1259 OID 17426)
-- Name: idx_payments_method; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_method ON public.payments USING btree (payment_method);


--
-- TOC entry 5364 (class 1259 OID 17289)
-- Name: idx_properties_owner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_properties_owner ON public.properties USING btree (owner_id);


--
-- TOC entry 5373 (class 1259 OID 17346)
-- Name: idx_tenants_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tenants_user ON public.tenants USING btree (user_id);


--
-- TOC entry 5367 (class 1259 OID 17321)
-- Name: idx_units_property; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_units_property ON public.units USING btree (property_id);


--
-- TOC entry 5368 (class 1259 OID 17322)
-- Name: idx_units_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_units_status ON public.units USING btree (status);


--
-- TOC entry 5358 (class 1259 OID 17259)
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- TOC entry 5359 (class 1259 OID 17260)
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- TOC entry 5399 (class 1259 OID 17488)
-- Name: idx_util_alloc_bill; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_util_alloc_bill ON public.utility_allocations USING btree (bill_id);


--
-- TOC entry 5400 (class 1259 OID 17489)
-- Name: idx_util_alloc_unit; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_util_alloc_unit ON public.utility_allocations USING btree (unit_id);


--
-- TOC entry 5393 (class 1259 OID 17460)
-- Name: idx_utility_bills_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_utility_bills_period ON public.utility_bills USING btree (billing_period);


--
-- TOC entry 5394 (class 1259 OID 17459)
-- Name: idx_utility_bills_property; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_utility_bills_property ON public.utility_bills USING btree (property_id);


--
-- TOC entry 5437 (class 2620 OID 17588)
-- Name: leases trg_leases_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_leases_updated_at BEFORE UPDATE ON public.leases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5436 (class 2620 OID 17587)
-- Name: properties trg_properties_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_properties_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5438 (class 2620 OID 17590)
-- Name: leases trg_sync_unit_status; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sync_unit_status AFTER INSERT OR UPDATE OF status ON public.leases FOR EACH ROW EXECUTE FUNCTION public.sync_unit_status_on_lease_change();


--
-- TOC entry 5435 (class 2620 OID 17586)
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- TOC entry 5432 (class 2606 OID 17547)
-- Name: expenses expenses_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE RESTRICT;


--
-- TOC entry 5433 (class 2606 OID 17552)
-- Name: expenses expenses_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id);


--
-- TOC entry 5423 (class 2606 OID 17378)
-- Name: leases leases_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leases
    ADD CONSTRAINT leases_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;


--
-- TOC entry 5424 (class 2606 OID 17383)
-- Name: leases leases_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.leases
    ADD CONSTRAINT leases_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- TOC entry 5430 (class 2606 OID 17513)
-- Name: maintenance_requests maintenance_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.maintenance_requests
    ADD CONSTRAINT maintenance_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;


--
-- TOC entry 5431 (class 2606 OID 17518)
-- Name: maintenance_requests maintenance_requests_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.maintenance_requests
    ADD CONSTRAINT maintenance_requests_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- TOC entry 5434 (class 2606 OID 17578)
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5425 (class 2606 OID 17414)
-- Name: payments payments_lease_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_lease_id_fkey FOREIGN KEY (lease_id) REFERENCES public.leases(id) ON DELETE RESTRICT;


--
-- TOC entry 5426 (class 2606 OID 17419)
-- Name: payments payments_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id);


--
-- TOC entry 5420 (class 2606 OID 17284)
-- Name: properties properties_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- TOC entry 5422 (class 2606 OID 17341)
-- Name: tenants tenants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 5421 (class 2606 OID 17316)
-- Name: units units_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;


--
-- TOC entry 5428 (class 2606 OID 17478)
-- Name: utility_allocations utility_allocations_bill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.utility_allocations
    ADD CONSTRAINT utility_allocations_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.utility_bills(id) ON DELETE CASCADE;


--
-- TOC entry 5429 (class 2606 OID 17483)
-- Name: utility_allocations utility_allocations_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.utility_allocations
    ADD CONSTRAINT utility_allocations_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;


--
-- TOC entry 5427 (class 2606 OID 17454)
-- Name: utility_bills utility_bills_property_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.utility_bills
    ADD CONSTRAINT utility_bills_property_id_fkey FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE RESTRICT;


-- Completed on 2026-05-15 11:06:13

--
-- PostgreSQL database dump complete
--

\unrestrict qlddhA4gekhO6nOTfv7K4YuToMpC9LbDDltg3BVTCK3w6R23F1OJmGGT0F4vFSa

