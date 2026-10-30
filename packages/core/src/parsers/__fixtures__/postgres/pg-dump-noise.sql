--
-- PostgreSQL database dump
--

-- Dumped from database version 16.4
-- Dumped by pg_dump version 16.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;

CREATE TYPE public.ticket_priority AS ENUM (
    'low',
    'normal',
    'urgent'
);

ALTER TYPE public.ticket_priority OWNER TO helpdesk;

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now(); -- semicolons inside the body must not split the statement
  RETURN NEW;
END;
$$;

SET default_tablespace = '';

CREATE TABLE public.tickets (
    id integer NOT NULL,
    subject character varying(200) NOT NULL,
    priority public.ticket_priority DEFAULT 'normal'::public.ticket_priority NOT NULL,
    requester_email character varying(320) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.tickets OWNER TO helpdesk;

CREATE SEQUENCE public.tickets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.tickets_id_seq OWNED BY public.tickets.id;

CREATE TABLE public.ticket_replies (
    id integer NOT NULL,
    ticket_id integer NOT NULL,
    body text NOT NULL,
    internal boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.tickets ALTER COLUMN id SET DEFAULT nextval('public.tickets_id_seq'::regclass);

COPY public.tickets (id, subject, priority, requester_email, created_at, updated_at) FROM stdin;
1	Printer on fire	urgent	pat@example.com	2024-01-01 10:00:00+00	2024-01-01 10:00:00+00
2	Password reset; again	normal	sam@example.com	2024-01-02 10:00:00+00	2024-01-02 10:00:00+00
\.

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ticket_replies
    ADD CONSTRAINT ticket_replies_pkey PRIMARY KEY (id);

CREATE INDEX tickets_priority_idx ON public.tickets USING btree (priority) WHERE (priority = 'urgent'::public.ticket_priority);

CREATE TRIGGER tickets_touch BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE ONLY public.ticket_replies
    ADD CONSTRAINT ticket_replies_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;

CREATE VIEW public.open_tickets AS
 SELECT tickets.id, tickets.subject FROM public.tickets;

GRANT SELECT ON TABLE public.tickets TO readonly;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

--
-- PostgreSQL database dump complete
--
