# Property-Management-System
CHAPTER 1 – PROJECT PROPOSAL
1.1 Background
In Zambia, many landlords manage rental properties manually using notebooks, spreadsheets, or informal communication methods such as phone calls and messaging platforms. This leads to:
•	Poor rent tracking
•	Lack of automated reminders
•	Unstructured maintenance reporting
•	Inefficient tenant management
•	Limited online property visibility
There is a need for a centralized web-based platform that combines property management and real estate listing services.
________________________________________
1.2 Problem Statement
Current property management practices in Zambia lack automation, transparency, and structured record keeping. Landlords struggle to track rent payments and maintenance issues efficiently, while tenants lack a formal channel to report property faults. Additionally, there is no integrated platform that combines internal property management with public property listing functionality.
________________________________________
1.3 Aim
To design and implement a web-based Property Management System and Real Estate Platform that enables landlords to manage properties efficiently while providing a public marketplace for property listings.
________________________________________
1.4 Objectives
•	Develop a secure authentication and role-based access system.
•	Implement property and tenant management features.
•	Develop lease and rent tracking functionality.
•	Implement automated rent reminders.
•	Provide maintenance reporting capabilities.
•	Develop a public property listing and filtering system.
•	Deploy and test the system in a real-world environment.
________________________________________
1.5 Scope
Included:
•	Web-based system
•	Role-based dashboards
•	Rent tracking
•	Maintenance management
•	Marketplace listing
Excluded:
•	Mobile native app
•	Online payment gateway integration
•	AI prediction features
________________________________________
📘 SOFTWARE REQUIREMENTS SPECIFICATION (SRS)
________________________________________
2.1 Functional Requirements
Authentication
•	Users must register and login securely.
•	System must support multiple roles.
Property Management
•	Landlords must create, update, and delete properties.
•	System must store property details and images.
Tenant Management
•	Landlords must assign tenants to properties.
•	System must prevent multiple active tenants in one unit.
Lease Management
•	System must track lease start and end dates.
•	System must calculate rent due dates automatically.
Payment Management
•	System must record rent payments.
•	System must flag overdue payments.
Maintenance
•	Tenants must report issues.
•	Landlords must update maintenance status.
Notifications
•	System must send rent reminders before due date.
•	System must notify landlord of overdue payments.
Marketplace
•	Public users must search and filter listings.
•	Admin must verify listings.
________________________________________
2.2 Non-Functional Requirements
•	System must be secure (JWT authentication).
•	System must handle concurrent users.
•	Database must be normalized.
•	System must be responsive.
•	Response time < 3 seconds.
________________________________________
🗄 DATABASE SCHEMA (Core Tables)
________________________________________
User
•	id
•	name
•	email
•	password
•	role
•	created_at
________________________________________
Property
•	id
•	owner_id (FK User)
•	title
•	province
•	address
•	type
•	bedrooms
•	price
•	status
________________________________________
Tenant
•	id
•	user_id (FK User)
•	phone
•	emergency_contact
________________________________________
Lease
•	id
•	property_id (FK Property)
•	tenant_id (FK Tenant)
•	start_date
•	end_date
•	monthly_rent
•	deposit
•	active_status
________________________________________
Payment
•	id
•	lease_id
•	amount
•	payment_date
•	payment_method
•	status
________________________________________
MaintenanceRequest
•	id
•	property_id
•	tenant_id
•	description
•	image
•	status
•	created_at
________________________________________
Listing
•	id
•	property_id
•	listing_type (rent/sale)
•	is_verified
•	created_at
________________________________________
📊 UML DIAGRAM BLUEPRINT
________________________________________
Use Case Diagram (Actors)
Actors:
•	Admin
•	Landlord
•	Tenant
•	Agent
•	Buyer
Use Cases:
•	Manage Property
•	Assign Tenant
•	Record Payment
•	Report Maintenance
•	View Listings
•	Search Listings
________________________________________
Class Diagram (Key Relationships)
User
↓
Property (One-to-Many)
↓
Lease (One-to-One active)
↓
Payment (One-to-Many)
Property
↓
MaintenanceRequest (One-to-Many)
Property
↓
Listing (Optional)
________________________________________
Sequence Example: Rent Payment
Tenant → Payment API → Payment Service → Database → Notification Service → Landlord
________________________________________
⚠ RISK ANALYSIS TABLE
Risk	Impact	Probability	Mitigation
Scope creep	High	Medium	Freeze requirements early
Security flaws	High	Low	Use Django best practices
Data inconsistency	Medium	Medium	Enforce constraints
Deadline pressure	High	Medium	Follow 6-week roadmap
Deployment issues	Medium	Low	Test staging first
________________________________________
🎯 MARKING RUBRIC STRATEGY
Examiners usually mark:
1.	Problem clarity (10–15%)
2.	Design & UML (20%)
3.	Implementation quality (30%)
4.	Testing (15%)
5.	Documentation (15%)
6.	Presentation (10%)
To score high:
•	Show clear architectural decisions.
•	Demonstrate validation rules.
•	Show working background job reminders.
•	Show role-based dashboards.
•	Explain database normalization.
________________________________________
🚀 FINAL MASTER CODING PROMPT
(Use This For Clean Implementation)
Copy and use this when coding:
You are a senior software engineer helping me build a final year project.

Project: Web-Based Property Management and Real Estate Platform for Zambia.

Tech Stack:
- Django
- Django REST Framework
- PostgreSQL
- Celery (for rent reminders)
- Redis

Requirements:
- No AI components.
- Clean architecture.
- Production-ready structure.
- Role-based access control.
- Proper database normalization (3NF).
- Clear separation of concerns.
- Business logic in service layer.
- Views must remain thin.
- Input validation required.
- Prevent data inconsistencies.
- Use migrations properly.

Modules:
1. Authentication (Custom User + Roles)
2. Property Management
3. Tenant Management
4. Lease Management
5. Payment Tracking
6. Maintenance Reporting
7. Notification System
8. Public Marketplace

Before generating any code:
- Restate what module we are building.
- Identify entities and relationships.
- Identify validation rules.
- Identify edge cases.
- Then generate:
    1. Models
    2. Serializers
    3. Services
    4. Views
    5. URLs
    6. Permissions
    7. Basic tests

Ensure:
- No circular imports
- Proper foreign key constraints
- Security best practices
- Scalable structure

Think step-by-step like a principal engineer.
CHAPTER 2 – LITERATURE REVIEW
________________________________________
CHAPTER TWO
LITERATURE REVIEW
________________________________________
2.1 Introduction
This chapter reviews existing literature related to property management systems and online real estate platforms. It examines current technological solutions, identifies gaps in traditional property management practices, and justifies the need for an integrated web-based solution tailored for Zambia.
________________________________________
2.2 Property Management Systems
Property Management Systems (PMS) are software solutions designed to assist landlords and property managers in managing rental properties. According to existing studies, PMS platforms automate tasks such as rent collection, lease tracking, and maintenance scheduling.
Modern systems such as Buildium and AppFolio provide cloud-based management solutions for landlords. These systems typically include:
•	Tenant management
•	Payment tracking
•	Financial reporting
•	Maintenance management
However, many of these systems are subscription-based and tailored for developed markets, making them less accessible for small-scale landlords in developing countries.
________________________________________
2.3 Real Estate Marketplace Platforms
Real estate marketplace platforms allow buyers and renters to search and compare properties online. Examples include Zillow and Property24.
These platforms provide:
•	Advanced search filters
•	Property image galleries
•	Agent contact features
•	Listing verification systems
While effective, these platforms focus primarily on public listings and do not always provide integrated internal property management functionality.
________________________________________
2.4 Limitations of Existing Systems
A review of current systems reveals several limitations:
1.	Separation of management and marketplace functions.
2.	High subscription costs.
3.	Limited customization for local markets.
4.	Lack of localized support for developing countries.
5.	Inadequate integration between tenant communication and management.
In Zambia, many landlords rely on manual bookkeeping and informal communication channels, which increases the risk of:
•	Missed payments
•	Poor record keeping
•	Unresolved maintenance issues
•	Inefficient property marketing
________________________________________
2.5 Web-Based Information Systems
Web-based systems provide accessibility, scalability, and centralized data management. Research indicates that web-based platforms improve operational efficiency, reduce administrative workload, and enhance data integrity.
The use of frameworks such as Django enables rapid development of secure and scalable web applications through:
•	Built-in authentication
•	ORM-based database management
•	Security protection mechanisms
•	MVC architectural pattern
________________________________________
2.6 Role-Based Access Control (RBAC)
Role-Based Access Control (RBAC) is a widely used access management model in modern systems. It restricts system access based on user roles, thereby improving security and accountability.
In property systems, RBAC ensures:
•	Landlords manage only their properties.
•	Tenants access only their lease data.
•	Admins oversee system-wide activities.
________________________________________
2.7 Database Design and Normalization
Proper database normalization reduces redundancy and improves data consistency. Third Normal Form (3NF) ensures:
•	Elimination of partial dependencies
•	Elimination of transitive dependencies
•	Structured relational integrity
This is critical in systems handling financial transactions and legal lease records.
________________________________________
2.8 Research Gap
While existing property management systems and real estate platforms provide useful functionalities, there is limited integration between internal management tools and public listing platforms in emerging markets such as Zambia.
There is a need for:
•	An integrated platform
•	Local market customization
•	Simplified usability
•	Affordable deployment
•	Web-based accessibility
________________________________________
2.9 Summary
This chapter reviewed existing property management and real estate systems. It identified the limitations of current platforms and highlighted the need for a localized, integrated web-based solution. The proposed system aims to bridge the gap by combining internal property management functionality with a public marketplace module within a secure and scalable architecture.

