\# Fieldnote



\### A study planner that actually plans.



I built Fieldnote because I wanted to solve a problem I was experiencing myself: \*\*having a lot of schoolwork is easy to track, but much harder to actually organise.\*\*



I started with the idea of making a simple study planner, but I quickly realised that a useful planner needed to do more than store tasks. It needed to answer questions like:



\* What should I study first?

\* How much time should I spend on it?

\* What can realistically fit before an exam?

\* Why was this task scheduled today?



That led me to build Fieldnote as a combination of \*\*AI and deterministic algorithms\*\*.



\## How it works



I use AI where understanding natural language is useful. For example, I can write:



> "I have a Maths exam on Friday covering integration and differential equations. I haven't revised differential equations yet."



The local AI converts this into structured study tasks that I can review and edit.



The actual scheduling is handled separately by my own Python algorithm. It considers factors such as:



\* deadline and urgency

\* task priority

\* difficulty

\* weak topics

\* remaining workload

\* available study time



This separation was an important part of the project. I didn't want to use an LLM simply because it was available — if something can be solved reliably with an algorithm, I wanted to build that algorithm myself.



\## The AI



Fieldnote currently uses \*\*Gemma 4 E4B through LM Studio\*\*, running locally.



This means I can experiment with AI functionality without depending on a paid cloud API, while keeping the AI component isolated from the rest of the application.



The AI is currently used for:



\* turning natural-language descriptions into tasks

\* breaking broad topics into smaller revision sessions

\* answering questions about my study plan



\## What I built



\*\*Backend:\*\* Python, Flask, SQLite

\*\*Frontend:\*\* HTML, CSS, JavaScript

\*\*AI:\*\* Gemma 4 E4B + LM Studio



The project includes a dashboard, task and exam management, weekly availability, progress tracking, personalised scheduling, AI-assisted task creation, and explanations for scheduling decisions.



\## What I learned



The most valuable part of building Fieldnote was learning that adding AI to a project isn't necessarily about putting an LLM everywhere.



I had to think about \*\*which problems actually benefit from AI and which are better solved with conventional programming\*\*. I also learned about structuring data, designing APIs, validating model output, handling edge cases, and turning an idea into something I could actually use.



Fieldnote started as a personal problem and became a way for me to explore the intersection between \*\*software engineering, algorithms, and artificial intelligence\*\*.



\## Future ideas



I would like to continue developing Fieldnote by experimenting with different local models, evaluating the quality of AI-generated tasks, improving personalisation, and making the scheduling algorithm more sophisticated.



\---



\*\*Built by Martín Merino\*\*



