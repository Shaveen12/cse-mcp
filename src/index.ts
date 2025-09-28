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

async function getDetailedCompanyInfo(symbol: string) {
  const company = companies.find(c => c.symbol === symbol);
  
  if (!company) {
    throw new Error(`Symbol ${symbol} not found. Please use search_company to find valid symbols.`);
  }
  
  try {
    const response = await axios.post(
      'https://www.cse.lk/api/companyInfoSummery',
      `symbol=${symbol}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      }
    );
    
    const data = response.data;
    const symbolInfo = data.reqSymbolInfo || {};
    const betaInfo = data.reqSymbolBetaInfo || {};
    
    return {
      symbol: symbolInfo.symbol,
      companyName: symbolInfo.name,
      lastTradedPrice: symbolInfo.lastTradedPrice,
      price52WeekHigh: symbolInfo.p12HiPrice,
      price52WeekLow: symbolInfo.p12LowPrice,
      ytdShareVolume: symbolInfo.ytdShareVolume,
      ytdTurnover: symbolInfo.ytdTurnover,
      marketCap: symbolInfo.marketCap,
      sharesIssued: symbolInfo.sharesIssued,
      beta: betaInfo.beta,
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

async function getTopGainers() {
  try {
    const response = await axios.post(
      'https://www.cse.lk/api/topGainers',
      {},
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    const data = response.data || [];
    
    return data.map((item: any) => ({
      symbol: item.symbol,
      price: item.price,
      change: item.change,
      changePercentage: item.changePercentage
    }));
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

async function getTopLosers() {
  try {
    const response = await axios.post(
      'https://www.cse.lk/api/topLooses',
      {},
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    const data = response.data || [];
    
    return data.map((item: any) => ({
      symbol: item.symbol,
      price: item.price,
      change: item.change,
      changePercentage: item.changePercentage
    }));
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

async function getMostActiveStocks() {
  try {
    const response = await axios.post(
      'https://www.cse.lk/api/mostActiveTrades',
      {},
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    const data = response.data || [];
    
    return data.map((item: any) => ({
      symbol: item.symbol,
      tradeVolume: item.tradeVolume,
      shareVolume: item.shareVolume,
      turnover: item.turnover
    }));
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

async function getMarketSummary() {
  try {
    const response = await axios.post(
      'https://www.cse.lk/api/marketSummery',
      {},
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    const data = response.data || {};
    
    return {
      tradeVolume: data.tradeVolume,
      shareVolume: data.shareVolume,
      tradeDate: data.tradeDate ? new Date(data.tradeDate).toISOString() : null
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
  
  server.registerTool(
    "get_detailed_company_info",
    {
      title: "Get Detailed Company Info",
      description: "Get comprehensive company information including 52-week high/low, YTD metrics, market cap, and beta values. Use search_company first to find the correct symbol.",
      inputSchema: {
        symbol: z.string()
          .regex(/^[A-Z]+\.[A-Z0-9]+$/, "Invalid symbol format. Use format like 'JKH.N0000'")
          .describe("Ticker symbol from CSE (e.g., 'JKH.N0000')")
      }
    },
    async ({ symbol }) => {
      try {
        const detailedInfo = await getDetailedCompanyInfo(symbol);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              symbol: detailedInfo.symbol,
              companyName: detailedInfo.companyName,
              lastTradedPrice: detailedInfo.lastTradedPrice ? `Rs. ${detailedInfo.lastTradedPrice.toFixed(2)}` : 'N/A',
              price52WeekHigh: detailedInfo.price52WeekHigh ? `Rs. ${detailedInfo.price52WeekHigh.toFixed(2)}` : 'N/A',
              price52WeekLow: detailedInfo.price52WeekLow ? `Rs. ${detailedInfo.price52WeekLow.toFixed(2)}` : 'N/A',
              ytdShareVolume: detailedInfo.ytdShareVolume?.toLocaleString() || 'N/A',
              ytdTurnover: detailedInfo.ytdTurnover ? `Rs. ${detailedInfo.ytdTurnover.toLocaleString()}` : 'N/A',
              marketCap: detailedInfo.marketCap ? `Rs. ${detailedInfo.marketCap.toLocaleString()}` : 'N/A',
              sharesIssued: detailedInfo.sharesIssued?.toLocaleString() || 'N/A',
              beta: detailedInfo.beta || 'N/A',
              lastUpdated: detailedInfo.lastUpdated
            }, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error fetching detailed company info: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );
  
  server.registerTool(
    "get_top_gainers",
    {
      title: "Get Top Gainers",
      description: "Get the top 10 gaining stocks in the CSE for the current trading day.",
      inputSchema: {}
    },
    async () => {
      try {
        const topGainers = await getTopGainers();
        
        const formattedGainers = topGainers.map((stock: any, index: number) => {
          const priceChangeSymbol = stock.change >= 0 ? '+' : '';
          return {
            rank: index + 1,
            symbol: stock.symbol,
            price: `Rs. ${stock.price.toFixed(2)}`,
            change: `${priceChangeSymbol}${stock.change.toFixed(2)}`,
            changePercentage: `${priceChangeSymbol}${stock.changePercentage.toFixed(2)}%`
          };
        });
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              title: "Top 10 Gainers",
              count: formattedGainers.length,
              gainers: formattedGainers,
              lastUpdated: new Date().toISOString()
            }, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error fetching top gainers: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );
  
  server.registerTool(
    "get_top_losers",
    {
      title: "Get Top Losers",
      description: "Get the top 10 losing stocks in the CSE for the current trading day.",
      inputSchema: {}
    },
    async () => {
      try {
        const topLosers = await getTopLosers();
        
        const formattedLosers = topLosers.map((stock: any, index: number) => {
          const priceChangeSymbol = stock.change >= 0 ? '+' : '';
          return {
            rank: index + 1,
            symbol: stock.symbol,
            price: `Rs. ${stock.price.toFixed(2)}`,
            change: `${priceChangeSymbol}${stock.change.toFixed(2)}`,
            changePercentage: `${priceChangeSymbol}${stock.changePercentage.toFixed(2)}%`
          };
        });
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              title: "Top 10 Losers",
              count: formattedLosers.length,
              losers: formattedLosers,
              lastUpdated: new Date().toISOString()
            }, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error fetching top losers: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );
  
  server.registerTool(
    "get_most_active_stocks",
    {
      title: "Get Most Active Stocks",
      description: "Get the top 10 most actively traded stocks by volume in the CSE for the current trading day.",
      inputSchema: {}
    },
    async () => {
      try {
        const mostActive = await getMostActiveStocks();
        
        const formattedActive = mostActive.map((stock: any, index: number) => ({
          rank: index + 1,
          symbol: stock.symbol,
          tradeVolume: stock.tradeVolume?.toLocaleString() || 'N/A',
          shareVolume: stock.shareVolume?.toLocaleString() || 'N/A',
          turnover: stock.turnover ? `Rs. ${stock.turnover.toLocaleString()}` : 'N/A'
        }));
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              title: "Top 10 Most Active Stocks",
              count: formattedActive.length,
              stocks: formattedActive,
              lastUpdated: new Date().toISOString()
            }, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error fetching most active stocks: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );
  
  server.registerTool(
    "get_market_summary",
    {
      title: "Get Market Summary",
      description: "Get the overall market summary including total trade volume, share volume, and trade date.",
      inputSchema: {}
    },
    async () => {
      try {
        const marketSummary = await getMarketSummary();
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              title: "Market Summary",
              tradeVolume: marketSummary.tradeVolume ? `Rs. ${marketSummary.tradeVolume.toLocaleString()}` : 'N/A',
              shareVolume: marketSummary.shareVolume?.toLocaleString() || 'N/A',
              tradeDate: marketSummary.tradeDate || 'N/A',
              lastUpdated: new Date().toISOString()
            }, null, 2)
          }]
        };
      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error fetching market summary: ${error.message}`
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