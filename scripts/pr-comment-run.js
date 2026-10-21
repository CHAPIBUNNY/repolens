#!/usr/bin/env node
import { runPullRequestComment } from "../src/delivery/architecture-comment.js";

const code = await runPullRequestComment();
process.exit(code);
