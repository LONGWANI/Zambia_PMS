# ZambiaPMS — Property Management System

> A production-grade web application for managing rental properties in Zambia.
> Built with Django REST Framework, PostgreSQL, and a vanilla JS frontend.

[![Tests](https://github.com/yourusername/zambia-pms/actions/workflows/tests.yml/badge.svg)](https://github.com/yourusername/zambia-pms/actions)
[![Coverage](https://codecov.io/gh/yourusername/zambia-pms/branch/main/graph/badge.svg)](https://codecov.io/gh/yourusername/zambia-pms)
[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![Django](https://img.shields.io/badge/Django-4.2-green)](https://djangoproject.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## Problem Statement

Zambia's property sector faces four systemic challenges:

| Problem | Impact | This System's Solution |
|---|---|---|
| Manual rent tracking | Revenue loss, disputes | Automated ledger with payment history |
| Shared utility billing | Unfair cost allocation | Auto-split algorithm (equal / by area / by occupants) |
| Poor maintenance tracking | Tenant dissatisfaction | Structured request → resolution workflow |
| No financial visibility | Poor decisions | Dashboard KPIs, charts, arrears report |

---

## Architecture

```
Browser ──HTTPS──▶ Nginx (reverse proxy + SSL)
                       │
                       ├──/static/──▶ Static files (direct)
                       │
                       └──/api/────▶ Gunicorn (WSGI)
                                         │
                                    Django 4.2 (DRF)
                                         │
                                    PostgreSQL 15
                                         │
                                    Celery + Redis
                                    (background tasks)
```

**3-Tier Architecture:**
- **Presentation** — HTML, Bootstrap 5, Vanilla JS, Chart.js
- **Application** — Django 4.2, Django REST Framework, JWT auth
- **Data** — PostgreSQL 15 with UUID primary keys and DECIMAL money fields

---

## Features

### Core
- **Property & Unit Management** — multi-property portfolio with occupancy tracking
- **Tenant Registration** — NRC number, emergency contacts, employer details
- **Lease Management** — open-ended and fixed-term leases, deposit tracking
- **Rent Billing** — manual payment recording (Cash, MTN Money, Airtel, Bank Transfer)
- **Utility Billing** — ZESCO/LWSC bills with 3-strategy auto-split algorithm
- **Maintenance Requests** — tenant submission → landlord assignment → resolution workflow
- **Expense Tracking** — property running costs with categorisation
- **Financial Reports** — monthly revenue, occupancy rates, arrears breakdown

### Intelligent Features
- **Smart Arrears Detection** — automatically flags overdue tenants after 5-day grace period
- **Predictive Revenue Trends** — 6-month Chart.js line chart with month-over-month comparison
- **Utility Auto-Split** — equal, by floor area (m²), or by occupant count
- **Notification System** — rent reminders, overdue alerts, maintenance updates
- **Lease Expiry Warnings** — automated 30-day and 7-day warnings via Celery

### Security
- JWT authentication with refresh token rotation and blacklisting
- Role-Based Access Control: Admin / Landlord / Tenant
- Row-level data isolation (Landlord A cannot access Landlord B's data)
- bcrypt password hashing, input validation, HSTS, rate limiting on login

---

## Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- Docker (for PostgreSQL and Redis)
- Git

### Setup

```bash
# 1. Clone
git clone https://github.com/yourusername/zambia-pms.git
cd zambia-pms

# 2. Start database and Redis
docker-compose up -d db redis

# 3. Set up backend
cd backend
python3.11 -m venv venv && source venv/bin/activate
pip install -r requirements/development.txt
cp .env.example .env   # then edit .env with your values

# 4. Initialise database
python manage.py migrate
python manage.py createsuperuser

# 5. Run
python manage.py runserver
```

API is available at `http://localhost:8000/api/`
Admin panel at `http://localhost:8000/admin/`

### Docker Compose (Full Stack)

```bash
docker-compose up
docker-compose exec backend python manage.py migrate
docker-compose exec backend python manage.py createsuperuser
```

---

## API Reference

Base URL: `https://yourdomain.com/api/`

All endpoints (except `/auth/login/` and `/auth/register/`) require:
```
Authorization: Bearer <access_token>
```

### Key Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login/` | Obtain JWT tokens |
| GET | `/properties/` | List landlord's properties |
| POST | `/payments/` | Record manual rent payment |
| POST | `/utility-bills/{id}/split/` | Run auto-split algorithm |
| GET | `/reports/dashboard/` | All KPIs in one call |
| GET | `/reports/arrears/` | Tenants with outstanding balances |

Full Postman collection: [`docs/ZambiaPMS.postman_collection.json`](docs/ZambiaPMS.postman_collection.json)

---

## Running Tests

```bash
# All tests with coverage report
pytest --cov=apps --cov-report=html

# Unit tests only (fast)
pytest -m unit -v

# API tests only
pytest -m api -v

# Specific module
pytest apps/billing/tests/ -v
```

Expected: **87 tests, 93%+ coverage**

---

## Project Structure

```
zambia-pms/
├── backend/
│   ├── apps/
│   │   ├── authentication/   # JWT, User, RBAC
│   │   ├── billing/          # Payments, UtilityBills, auto-split
│   │   ├── maintenance/      # Maintenance request workflow
│   │   ├── notifications/    # Notification dispatch
│   │   ├── properties/       # Properties, Units
│   │   ├── reports/          # Dashboard KPIs, analytics
│   │   └── tenants/          # Tenant profiles, Leases
│   ├── core/                 # Shared base model, pagination, exceptions
│   ├── config/               # Settings, URLs, WSGI
│   └── tests/factories.py    # Test data factories
├── frontend/                 # HTML, CSS, JS (Bootstrap + Chart.js)
├── deploy/                   # Nginx, systemd service files
├── docker-compose.yml
└── deploy.sh                 # Zero-downtime deployment script
```

---

## Deployment

See the full deployment guide in [`docs/deployment.md`](docs/deployment.md).

**Quick production checklist:**

```bash
# 1. Set all environment variables in .env (DEBUG=False, strong SECRET_KEY)
# 2. Run migrations
python manage.py migrate
# 3. Collect static files
python manage.py collectstatic --noinput
# 4. Start services
systemctl start gunicorn celery celerybeat
# 5. Configure Nginx (see deploy/nginx/)
# 6. Get SSL certificate
certbot --nginx -d yourdomain.com
```

---

## Engineering Principles Applied

| Principle | Where Applied |
|---|---|
| **SOLID — Single Responsibility** | Views handle HTTP; serializers handle shape; services handle logic |
| **SOLID — Open/Closed** | `UtilityBillService` accepts strategy parameter — add methods without modifying existing |
| **DRY** | `TimeStampedModel` base class; central `api.js` client; `NotificationService` |
| **Separation of Concerns** | 3-tier architecture; services layer isolates all business rules |
| **Clean Architecture** | No cross-app model imports; all domain communication via services |
| **RESTful Design** | Nouns as URLs, HTTP verbs for actions, consistent status codes |
| **Secure by Default** | JWT, RBAC, bcrypt, parameterised queries, HSTS, rate limiting |

---

## Database Design

11 tables with UUID primary keys, DECIMAL money fields, and PostgreSQL constraints:

- `EXCLUDE USING gist` prevents double-booking a unit with overlapping leases
- `ON DELETE RESTRICT` on financial tables — prevents accidental data loss
- Immutable payment records — reversals create new rows, never update old ones
- `CITEXT` for case-insensitive email storage and comparison

---

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Language | Python | 3.11 |
| Framework | Django | 4.2 |
| API | Django REST Framework | 3.15 |
| Auth | djangorestframework-simplejwt | 5.3 |
| Database | PostgreSQL | 15 |
| ORM | Django ORM | — |
| Task Queue | Celery | 5.4 |
| Broker | Redis | 7 |
| Web Server | Gunicorn | 22.0 |
| Proxy | Nginx | 1.24 |
| Frontend | Bootstrap | 5.3 |
| Charts | Chart.js | 4.4 |
| Testing | pytest-django | 4.8 |

---

## Author


Final Year Project — Bachelor of Science in Computer Science
[University Name], Lusaka, Zambia, 2025

---

## License

MIT License — see [LICENSE](LICENSE)
