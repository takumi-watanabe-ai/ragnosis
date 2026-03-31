# Realistic User Questions for RAGnosis

A collection of questions users might ask when using the RAG system, ranging from beginner to advanced, short to detailed.

---

## Entry-Level / Getting Started

1. What is RAG?

2. How does RAG work?

3. best embedding model for beginners

4. I'm new to RAG - where should I start?

5. What's the difference between RAG and fine-tuning?

6. Do I need a vector database for RAG?

7. Can I build RAG without coding?

8. What's the easiest way to build a RAG system?

9. I want to build a chatbot that answers questions from my company docs. Is RAG the right approach?

10. How much does it cost to run a RAG system?

---

## Model & Tool Discovery

11. top embedding models

12. What are the most popular vector databases?

13. best open source embedding model

14. Supabase/gte-small vs OpenAI embeddings

15. Which embedding model works best for code documentation?

16. I need a free embedding model that works well - what are my options?

17. What's the best vector database for small projects?

18. langchain vs llamaindex

19. Are there any good RAG frameworks for Python?

20. What embedding models support multilingual content?

21. lightweight embedding models for edge deployment

22. I'm looking for a vector database that can handle 10M documents - what should I use?

23. Best reranking models for RAG

24. What's trending in RAG right now?

25. chromadb vs pinecone vs weaviate

---

## Implementation & Architecture

26. How do I improve retrieval accuracy?

27. What's the best chunking strategy for RAG?

28. My RAG system returns irrelevant results - how do I fix this?

29. How to implement hybrid search?

30. What chunk size should I use for technical documentation?

31. How do I handle long documents in RAG?

32. Should I use cosine similarity or dot product for vector search?

33. I'm getting slow query times - how can I optimize my RAG pipeline?

34. How do I prevent hallucinations in RAG?

35. What's the right way to structure prompts for RAG?

36. How many documents should I retrieve before reranking?

37. Do I need to fine-tune my embedding model?

38. My vector search is too slow with 1M documents. What am I doing wrong?

39. How to build a production-ready RAG system?

40. What's the best way to handle metadata in RAG?

---

## Advanced / Complex Queries

41. How do I implement query expansion in RAG to handle synonyms and related terms?

42. I'm building a RAG system for legal documents - they're super long (100+ pages). Should I use hierarchical chunking or a different approach?

43. What are the trade-offs between using a smaller embedding model like gte-small vs a larger one like E5-large?

44. How to implement multi-tenancy in a RAG system where different users have access to different document sets?

45. My RAG system needs to work in English, Spanish, and Mandarin. Should I use separate embedding models or a multilingual one?

46. What's the best approach for handling real-time updates to the knowledge base without rebuilding all embeddings?

47. How do I evaluate RAG performance beyond just eyeballing results?

48. I want to combine dense retrieval with BM25 - what's the best way to merge the scores?

49. Should I use cross-encoders for reranking or is BM25 good enough?

50. How do agentic RAG systems differ from traditional RAG?

---

## Troubleshooting

51. why is my RAG returning duplicate results

52. My embeddings don't seem to capture semantic meaning well - what's wrong?

53. RAG works great in tests but terrible in production - what could be the issue?

54. How do I debug poor retrieval quality?

55. My vector database is using too much memory - how can I reduce it?

56. Getting timeout errors on large document searches - help!

57. Why does my RAG system work well for some topics but badly for others?

58. My reranker is making results worse, not better. What am I doing wrong?

59. How to handle documents with very different lengths in the same RAG system?

60. Users are asking questions my RAG can't answer even though the info is in the docs - why?

---

## Comparisons

61. RAG vs fine-tuning - when should I use which?

62. Semantic search vs keyword search vs hybrid - which is better?

63. OpenAI embeddings vs open source alternatives - is the quality difference worth the cost?

64. Pinecone vs pgvector - which should I choose for a startup?

65. LangChain vs LlamaIndex vs building from scratch - pros and cons?

66. Is Claude better than GPT-4 for RAG answer generation?

67. Should I use a dedicated vector DB or just add pgvector to my existing Postgres?

68. Cohere rerank vs cross-encoder models - which gives better results?

69. Single-stage retrieval vs retrieve-then-rerank - what's the performance difference?

70. Local LLM (Ollama) vs API (OpenAI) for RAG - cost vs quality trade-offs?

---

## Trends & Market Intelligence

71. What are the top RAG frameworks on GitHub?

72. Which embedding models are growing in popularity?

73. What's the most downloaded RAG library on HuggingFace?

74. Are people moving away from LangChain? What are they using instead?

75. What are the emerging trends in RAG for 2024?

76. Is anyone using graph RAG in production yet?

77. What's the state of RAG evaluation tools?

78. Are there any new vector databases I should know about?

79. What are companies actually using for RAG in production?

80. Is RAG overhyped or is it actually solving real problems?

---

## Specific Use Cases

81. How to build RAG for customer support tickets?

82. Best approach for RAG with code documentation?

83. I need to build a RAG system for medical documents - any special considerations?

84. How do I build RAG that can answer questions from tables and charts, not just text?

85. Can RAG work with audio transcripts?

86. Building RAG for e-commerce product search - what's different from regular RAG?

87. How to implement RAG for multi-modal content (text + images)?

88. I want to build a personal knowledge base with RAG - what's the simplest setup?

89. RAG for research papers - how to handle citations and references?

90. Can I use RAG to query SQL databases using natural language?

---

## Cost & Performance

91. How much does it cost to run RAG at scale?

92. What's cheaper - embedding 1M documents once or querying GPT-4 100k times?

93. How to reduce token costs in RAG?

94. My RAG system costs $1000/month in API calls - how can I optimize?

95. Is it worth running embeddings locally vs using an API?

96. What's the latency difference between cloud vector DBs and self-hosted?

97. How to estimate infrastructure costs for a RAG system with 50k users?

98. At what scale does it make sense to self-host instead of using APIs?

99. How can I reduce embedding costs without sacrificing quality?

100. What's the cost breakdown for a typical RAG application?

---

## Short & Direct Questions

101. best chunking size

102. rag evaluation metrics

103. hybrid search implementation

104. context window limits

105. semantic caching for rag

106. how to handle pdfs in rag

107. rag with structured data

108. query rewriting techniques

109. embedding dimension tradeoffs

110. rag security best practices

---

## Conversational / Informal

111. anyone using rag in production? how's it going?

112. im stuck on chunking strategy help

113. does rag actually work or is it just hype?

114. why is everyone talking about hybrid search now

115. what happened to fine-tuning? is rag better?

116. I tried building RAG and it's terrible, am I missing something?

117. quick question - can I use RAG without a vector database?

118. real talk: is LangChain worth the complexity?

119. ok so I've got 10k PDFs - now what?

120. help! my rag is hallucinating like crazy

---

## Long & Detailed Scenarios

121. I'm building a RAG system for a legal tech startup. We have about 50,000 legal documents (contracts, case law, statutes) averaging 20 pages each. Users need to ask complex questions like "what are the termination clauses in all vendor contracts from 2023?" We need high accuracy because wrong answers could have legal consequences. Should I use hierarchical chunking? What embedding model handles legal language well? And how do I structure metadata to enable filtering by document type and date?

122. Our company is migrating from a traditional search system to RAG. We have 5 million product descriptions, user manuals, and FAQ documents. The search needs to work in English, Spanish, French, and German. Current system uses Elasticsearch with BM25. I'm wondering: should we go hybrid (keep BM25, add vector search) or go all-in on RAG? What's the migration strategy? Can we A/B test both approaches? And how do we handle the fact that some languages have way more content than others?

123. I work at a B2B SaaS company and we want to replace our customer support docs with a RAG-powered chatbot. We get about 10,000 support queries per month, mostly from the same 100 questions. The docs are constantly updated (daily changes). I'm trying to figure out: what's the best way to handle incremental updates without re-embedding everything? Should we use semantic caching to reduce LLM costs? And how do we measure if the RAG system is actually better than our current keyword search?

124. Building a research assistant that needs to work with academic papers (PDFs with complex formatting, tables, equations, figures). The system needs to: 1) extract text accurately from PDFs, 2) understand citations and references, 3) handle mathematical notation, 4) link related papers together. I'm overwhelmed by the options. Should I use a specialized PDF parser? Do I need a multimodal embedding model for figures? How do I chunk papers that have sections, subsections, and appendices? What about the references section - should that be separate chunks?

125. We're a healthcare startup building a clinical decision support tool. It needs to query medical literature, clinical guidelines, and patient records (anonymized). Accuracy is critical - we can't have hallucinations. We're thinking about implementing: semantic search for finding relevant studies, BM25 for exact medication names, metadata filtering for study type and publication date, and maybe a reranker. Plus we need to cite sources for everything. The challenge is some medical terms are super specific (drug names) while some queries are conceptual (treatment approaches). How should we architect this? What embedding model works for medical terminology? Should we fine-tune?

---

## Meta Questions (About RAG Itself)

126. What problems is RAG actually good at solving?

127. When should I NOT use RAG?

128. Is RAG production-ready or still experimental?

129. What are the biggest challenges in RAG?

130. How is RAG evolving? What's next?

131. What's the difference between RAG and semantic search?

132. Are there alternatives to RAG I should consider?

133. What are the limitations of RAG?

134. How do I know if RAG is working well?

135. What's the future of RAG technology?
