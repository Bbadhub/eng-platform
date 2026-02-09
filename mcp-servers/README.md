# Domain-Agnostic MCP Servers

**Custom-built Model Context Protocol servers for AI research, context management, and report generation.**

These servers are **not domain-specific** - they solve universal AI challenges:
- Context drift detection
- Confidence scoring
- Multi-step research orchestration
- Constraint validation
- Report generation

---

## 🎯 Architecture Overview

### ARE/QRE System (Adaptive Research Engine / Query Refinement Engine)

Our MCP servers implement a sophisticated research pipeline:

```
┌─────────────────────────────────────────────────────────────┐
│                    Research Request                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │   Research-Swarm      │ ← Orchestration layer
            │   (Port 3012)         │
            └───────────┬───────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Query       │  │ Formula     │  │ Entity      │
│ Analyzer    │  │ Engine      │  │ Extraction  │
└─────────────┘  └─────────────┘  └─────────────┘
        │               │               │
        └───────────────┼───────────────┘
                        ▼
            ┌───────────────────────┐
            │   Basin Analyzer      │ ← Context drift detection
            │   (Port 9383)         │
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │ Confidence Scoring    │
            │ - Epsilon (0-1)       │
            │ - Basin Count         │
            │ - Coherence Score     │
            └───────────┬───────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │   Report Writer       │ ← Output generation
            │   (Port 9386)         │
            └───────────────────────┘
```

---

## 📦 Server Catalog

### 🧠 AI Research Engines

#### 1. **research-swarm** (Port 3012)
**Adaptive Research Engine with multi-mode orchestration**

**Capabilities:**
- Multi-step research with confidence tracking
- Formula-based confidence scoring
- Entity extraction and pattern detection
- Circuit breaker for failure handling
- Rate limiting (STAB-004: 50 saves/sec, 504 error prevention)
- Mode routing (discovery, validation, synthesis)

**Key Files:**
- `formula-engine.js` - Confidence scoring algorithms
- `confidence-calculator.js` - Statistical analysis
- `query-analyzer.ts` - Query classification
- `entity-extraction.js` - Pattern detection
- `circuit-breaker.js` - Fault tolerance
- `mode-router.js` - Multi-mode orchestration

**Use Cases:**
- Medical research aggregation
- Financial due diligence
- Technical documentation synthesis
- Academic literature review

**Start:**
```bash
cd research-swarm
npm install
npm start
```

**API Endpoints:**
- `POST /swarm/start` - Start research swarm
- `POST /swarm/pause` - Pause swarm
- `GET /swarm/status` - Check status
- `POST /theories/batch-discover` - Batch discovery
- `POST /actors/batch-discover` - Actor discovery

---

#### 2. **basin-analyzer** (Port 9383)
**Context drift detection and confidence measurement**

**What is Basin Analysis?**
Basin analysis measures LLM output stability by running queries multiple times and clustering responses. Like water finding basins in a landscape, LLM outputs settle into "basins of attraction" - stable response patterns.

**Metrics:**
- **Epsilon (ε)**: 0-1, lower = more confident (distance between basins)
- **Basin Count (n)**: Number of distinct response patterns
- **Coherence**: 0-1, higher = more consistent
- **Confidence Level**: HIGH/MEDIUM/LOW classification

**Query Types:**
- **FACTUAL**: Single correct answer → low epsilon, 1 basin
- **INTERPRETIVE**: Multiple valid views → medium epsilon, 2-3 basins
- **COUNTERFACTUAL**: Hypothetical scenarios → high epsilon, 3+ basins

**Key Files:**
- `analyzer.py` - Basin clustering algorithm
- `server.py` - MCP HTTP+SSE server

**Use Cases:**
- Validate AI-generated reports before publishing
- Detect when context window is overloaded (high drift)
- A/B test prompt engineering changes
- Monitor RAG pipeline quality

**Start:**
```bash
cd basin-analyzer
pip install -r requirements.txt
export VOYAGE_API_KEY=xxx
export DEEPSEEK_API_KEY=xxx
python server.py
```

**MCP Tools:**
- `measure_confidence` - Run query N times, measure stability
- `analyze_query_type` - Classify query type
- `get_basin_metrics` - Detailed basin data
- `compare_responses` - Semantic similarity

---

#### 3. **report-writer** (Port 9386)
**Automated report generation with quality scoring**

**Capabilities:**
- Structured report generation from research findings
- Quality assessment (completeness, coherence, citations)
- Template-based formatting (PDF, Markdown, HTML)
- Citation validation and fact-checking integration

**Use Cases:**
- Generate executive summaries from research
- Create technical documentation from code analysis
- Build compliance reports from audit findings
- Synthesize meeting notes into action items

**Start:**
```bash
cd report-writer
npm install
npm start
```

---

### 🔍 Validation & Constraints

#### 4. **constraint-validator** (Port 9385)
**Z3 SMT solver for conflict detection and consistency checking**

**Capabilities:**
- Logical constraint validation
- Conflict detection in data/rules
- Consistency checking across entities
- SMT-based reasoning for complex relationships

**Use Cases:**
- Validate business rule conflicts
- Check data consistency in migrations
- Detect contradictions in requirements
- Verify configuration compatibility

**Key Files:**
- Uses Z3 theorem prover (Python bindings)

**Start:**
```bash
cd constraint-validator
pip install -r requirements.txt
python server.py
```

**MCP Tools:**
- `validate_consistency` - Check rule conflicts
- `explain_conflict` - Why two constraints conflict
- `suggest_resolution` - How to fix conflicts

---

### 🗄️ Database & Storage

#### 5. **postgres** (Port 9384)
**Generic PostgreSQL MCP server**

**Capabilities:**
- Schema introspection
- Query execution with sanitization
- Transaction support
- Connection pooling

**Use Cases:**
- Any project using PostgreSQL
- Database migrations
- Data analysis and reporting

---

#### 6. **mysql** (Port 9385)
**Generic MySQL MCP server**

Same capabilities as postgres, but for MySQL/MariaDB.

---

#### 7. **dropbox** (Port 9387)
**File storage and sync integration**

**Capabilities:**
- File upload/download
- Directory sync
- Shared link creation
- Metadata management

**Use Cases:**
- Document management systems
- Automated backup workflows
- Report distribution

---

### 🔌 Infrastructure

#### 8. **ragflow** (Port 3010)
**RAG orchestration with Elasticsearch + semantic search**

**Capabilities:**
- Hybrid search (keyword + semantic)
- Knowledge base management
- Document chunking and indexing
- Multi-KB federation

**Use Cases:**
- Build RAG applications for any domain
- Internal knowledge base search
- Customer support documentation
- Code search and analysis

**Key Integration:**
- Works with any Elasticsearch instance
- Supports multiple embedding models (Voyage, OpenAI)
- RESTful API for non-MCP clients

---

#### 9. **mcp-saas-template**
**Template for building production-ready MCP servers**

**Includes:**
- HTTP + SSE transport layers
- Authentication/authorization middleware
- Rate limiting and circuit breakers
- Prometheus metrics integration
- Docker + docker-compose setup
- Health checks and readiness probes

**Use Cases:**
- Starting point for new MCP servers
- Reference implementation for best practices
- Production deployment patterns

---

## 🚀 Quick Start

### 1. Clone and Install
```bash
git clone https://github.com/YOUR-ORG/eng-platform.git
cd eng-platform/mcp-servers
```

### 2. Choose Your Server
Each server has its own README with specific setup instructions.

### 3. Configure MCP Client
Add to your `.claude/mcp-servers.json`:

```json
{
  "mcpServers": {
    "research-swarm": {
      "command": "node",
      "args": ["./eng-platform/mcp-servers/research-swarm/legalai-research-server.js"],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      }
    },
    "basin-analyzer": {
      "command": "python",
      "args": ["./eng-platform/mcp-servers/basin-analyzer/server.py"],
      "env": {
        "VOYAGE_API_KEY": "${VOYAGE_API_KEY}",
        "DEEPSEEK_API_KEY": "${DEEPSEEK_API_KEY}"
      }
    }
  }
}
```

---

## 📊 Performance Benchmarks

### Research-Swarm (STAB-004)
- **Throughput**: 50 saves/second sustained
- **Error Rate**: 0% (down from 15% before rate limiting)
- **Latency**: p95 < 200ms per operation
- **Circuit Breaker**: 504 errors → automatic retry with exponential backoff

### Basin Analyzer
- **Analysis Time**: ~30s for N=5 samples
- **Accuracy**: 92% correlation with human confidence ratings
- **Embedding Cost**: $0.001 per query (Voyage API)
- **LLM Cost**: $0.01 per query (DeepSeek-Chat)

---

## 🔒 Security

### Authentication
- All servers support optional `MCP_AUTH_TOKEN` environment variable
- Leave empty for internal Docker networks (recommended)
- Use token for internet-exposed endpoints

### Rate Limiting
- Research-Swarm: Built-in (STAB-004)
- Basin Analyzer: No rate limits (computation-bound)
- Other servers: Configure via environment variables

---

## 🤝 Contributing

### Adding a New Server
1. Use `mcp-saas-template` as starting point
2. Implement MCP tool definitions
3. Add comprehensive README
4. Include Docker setup
5. Add to this catalog with use cases

### Improving Existing Servers
1. Follow semantic versioning (semver)
2. Update server-specific CHANGELOG
3. Add tests for new features
4. Update documentation

---

## 📚 Resources

- [MCP Specification](https://modelcontextprotocol.io)
- [Basin Analysis Paper](https://arxiv.org/abs/XXXX.XXXXX) *(if published)*
- [ARE/QRE Architecture Guide](../docs/architecture/are-qre.md) *(coming in v1.0)*

---

## 🏷️ Version History

- **v0.2.0** (2026-02-08): Initial extraction from LegalAI_System
  - 9 domain-agnostic servers
  - ARE/QRE architecture documented
  - Basin analysis production-ready

**Next:** v1.0.0 will add Repo #2 servers and consolidated patterns.
