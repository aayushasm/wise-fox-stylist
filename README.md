# wise-fox-stylist
Smart stylist submission for Build &amp; Blog 25

## 📄 Serverless Stylist: Architectural Whitepaper

The Serverless Stylist is an event-driven, decoupled e-commerce agent that leverages a small, in-container Large Language Model (LLM) for real-time, highly personalized styling recommendations at cloud-scale.

---

### 1. High-Level System Architecture

The solution adheres to the principle of single responsibility, dividing functionality across three serverless components:

| Component | Technology Stack | Core Responsibility | Key Architectural Feature |
| :--- | :--- | :--- | :--- |
| *Orchestrator* | Static Web App (HTML/JS) | *Client-Driven Control.* Manages UI state and initiates all read/write operations and compute requests. | *Stateless Backend:* No session state or server cookies are required. |
| *State Layer* | *Firestore (NoSQL)* | *Persistent User Memory.* Stores user profiles, styles, and wardrobe data. | *Decoupled State:* Separates user data from compute resources, optimizing scalability. |
| *Compute Layer* | *Cloud Run (Container)* | *Stateless AI Execution.* Hosts the compact LLM agent to analyze products against user profiles. | *Scale-to-Zero:* Ensures cost efficiency with zero idle cost. |



---

### 2. The In-Container AI Agent (Cloud Run)

The core logic is executed within a single, self-contained Cloud Run instance designed for minimal latency and predictable performance.

#### *Technology Stack:*
* *Model:* *Gemma 3 270M. Selected for high instruction-following capability, low latency, and efficient resource consumption, prioritizing **consistency over creative variability*.
* *Runtime:* Python (Flask) with Genkit (ADK) flows.
* *Hosting:* Ollama server, running the model *in-container*.
* *Schema Enforcement:* Pydantic for strict typed I/O.

#### *Deployment Strategy: Baked-In AI*
A *multistage Dockerfile* is used to pre-pull and cache the Gemma 3 270M model directly into the container image. This strategy ensures:
1.  *Fast Cold-Starts:* No runtime download delay.
2.  *Zero Inference Latency:* The model is accessed locally within the container.
3.  *Predictable Cost:* Billing is purely based on request processing time.

---

### 3. Data Flow and Personalization Logic

The system distinguishes between two primary user experiences, both revolving around the stateless compute model:

| Flow Type | Data Retrieval | Compute Execution | Result |
| :--- | :--- | :--- | :--- |
| *Cold Start* | User manually inputs style/wardrobe. | Profile data + product list sent to Cloud Run. | Products are annotated, client sorts (High > Medium > Low), and renders. |
| *Warm Start* | Client auto-loads profile from *Firestore* ($getDoc()$). | Profile data + product list immediately sent to Cloud Run in the background. | Personalized catalog renders automatically upon return. |

#### *The Prompt Pincer Strategy*
To enforce deterministic output from the small LLM, the system uses two forces:
1.  *System Prompt (The Guide):* Defines the stylist's role, constraints, and multi-step process.
2.  *Output Schema (The Hammer):* *Genkit's output_schema and Pydantic* force the output into a specific, validated JSON structure, ensuring reliability for subsequent client-side processing.

---

### 4. Serverless Rationale

*Cloud Run* provides the ideal operational model for the highly variable load typical of e-commerce (flash sales, holiday spikes):

* *Elastic Scalability:* Instant scale-out capability launches thousands of instances in seconds to meet peak demand.
* *Cost Efficiency:* *Scale-to-Zero* ensures the entire compute stack costs $0 when no traffic is present.
* *Zero Operations:* Eliminates the overhead of managing VMs, patching, autoscaling groups, and load balancers.
