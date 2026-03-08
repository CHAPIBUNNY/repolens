import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.NOTION_TOKEN;
const version = process.env.NOTION_VERSION;
const pageId = process.env.NOTION_PARENT_PAGE_ID;

async function run() {

  const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Notion-Version": version,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      children: [
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: "RepoLens Test Documentation"
                }
              }
            ]
          }
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: "This content was generated automatically by RepoLens."
                }
              }
            ]
          }
        }
      ]
    })
  });

  const data = await res.json();

  console.log(data);
}

run();