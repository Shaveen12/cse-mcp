#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parse } from "csv-parse/sync";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Company {
  id: number;
  symbol: string;
  name: string;
}

let companies: Company[] = [];

async function loadCompanies() {
  try {
    const csvPath = path.join(__dirname, '..', 'cse_companies.csv');
    const fileContent = await fs.readFile(csvPath, 'utf-8');
    
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    companies = records.map((record: any) => ({
      id: parseInt(record.ID),
      symbol: record.Symbol,
      name: record['Company Name']
    }));
    
    console.error(`Loaded ${companies.length} companies from CSV`);
  } catch (error) {
    console.error('Error loading companies CSV:', error);
    process.exit(1);
  }
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

function searchCompanies(query: string): Company[] {
  const searchTerm = query.toLowerCase();
  
  // Calculate similarity scores for all companies
  const companiesWithScores = companies.map(company => {
    const symbolLower = company.symbol.toLowerCase();
    const nameLower = company.name.toLowerCase();
    
    // Check for exact matches first (score 0 is best)
    if (symbolLower === searchTerm || nameLower === searchTerm) {
      return { company, score: 0 };
    }
    
    // Check for substring matches (prioritize these)
    if (symbolLower.includes(searchTerm) || nameLower.includes(searchTerm)) {
      return { company, score: 1 };
    }
    
    // Calculate fuzzy matching scores
    const symbolDistance = levenshteinDistance(searchTerm, symbolLower);
    const nameDistance = levenshteinDistance(searchTerm, nameLower);
    
    // Also check against individual words in company name
    const nameWords = nameLower.split(/\s+/);
    const wordDistances = nameWords.map(word => levenshteinDistance(searchTerm, word));
    const minWordDistance = Math.min(...wordDistances);
    
    // Use the minimum distance as the score
    const minDistance = Math.min(symbolDistance, nameDistance, minWordDistance);
    
    return { company, score: minDistance };
  });
  
  // Sort by score (lower is better) and return top 3
  companiesWithScores.sort((a, b) => a.score - b.score);
  
  return companiesWithScores.slice(0, 3).map(item => item.company);
}

async function getStockData(symbol: string) {
  const company = companies.find(c => c.symbol === symbol);
  
  if (!company) {
    throw new Error(`Symbol ${symbol} not found. Please use search_company to find valid symbols.`);
  }
  
  try {
    const response = await axios.post(
      `https://www.cse.lk/api/homeCompanyData?symbol=${symbol}`,
      {},
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    const data = response.data;
    
    return {
      id: data.id,
      symbol: data.symbol,
      companyName: company.name,
      price: data.price,
      change: data.change,
      changePercentage: data.changePercentage,
      lastUpdated: new Date().toISOString()
    };
  } catch (error: any) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timed out. Please try again.');
    } else if (error.response) {
      throw new Error(`API error: ${error.response.status} - ${error.response.statusText}`);
    } else {
      throw new Error(`Network error: ${error.message}`);
    }
  }
}

async function main() {
  await loadCompanies();
  
  const server = new McpServer({
    name: "cse-mcp",
    version: "1.0.0"
  });
  
  server.registerTool(
    "search_company",
    {
      title: "Search Company",
      description: "Search for Colombo Stock Exchange companies by name or symbol. Uses fuzzy matching to return the 3 closest matches.",
      inputSchema: {
        query: z.string().min(1).describe("Company name or symbol to search (e.g., 'JKH' or 'John Keells')")
      }
    },
    async ({ query }) => {
      const results = searchCompanies(query);
      
      if (results.length === 0) {
        return {
          content: [{
            type: "text",
            text: `No companies found matching "${query}". Try a different search term.`
          }]
        };
      }
      
      const formattedResults = results.map(company => ({
        id: company.id,
        symbol: company.symbol,
        name: company.name
      }));
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            query: query,
            count: results.length,
            companies: formattedResults,
            note: "Top 3 matches using fuzzy search"
          }, null, 2)
        }]
      };
    }
  );
  
  server.registerTool(
    "get_stock_data",
    {
      title: "Get Stock Data",
      description: "Get real-time stock price data for a specific CSE ticker symbol. Use search_company first to find the correct symbol.",
      inputSchema: {
        symbol: z.string()
          .regex(/^[A-Z]+\.[A-Z0-9]+$/, "Invalid symbol format. Use format like 'JKH.N0000'")
          .describe("Ticker symbol from CSE (e.g., 'JKH.N0000')")
      }
    },
    async ({ symbol }) => {
      try {
        const stockData = await getStockData(symbol);
        
        const priceChangeSymbol = stockData.change >= 0 ? '+' : '';
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              symbol: stockData.symbol,
              companyName: stockData.companyName,
              price: `Rs. ${stockData.price.toFixed(2)}`,
              change: `${priceChangeSymbol}${stockData.change.toFixed(2)}`,
              changePercentage: `${priceChangeSymbol}${stockData.changePercentage.toFixed(2)}%`,
              lastUpdated: stockData.lastUpdated
            }, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error fetching stock data: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CSE MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});