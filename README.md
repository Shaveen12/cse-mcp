# CSE MCP Server

A Model Context Protocol (MCP) server that provides real-time stock market data from the Colombo Stock Exchange (CSE). This server enables AI assistants to search for companies and retrieve current stock prices from the Sri Lankan stock market.

## Features

- **Company Search**: Search for CSE-listed companies by name or symbol with fuzzy matching
- **Real-time Stock Data**: Get current price, change, and percentage change for any CSE ticker
- **Fuzzy Matching**: Find companies even with typos or partial names
- **308 Companies**: Complete database of all CSE-listed companies

## Installation

### Via NPM (Recommended)
```bash
npx cse-mcp
```

Or install globally:
```bash
npm install -g cse-mcp
cse-mcp
```

### From Source
```bash
git clone https://github.com/Shaveen12/cse-mcp.git
cd cse-mcp
npm install
npm run build
npm start
```

## Usage with MCP Clients

### Claude Desktop / Claude Code

#### Using Claude CLI (Recommended)
```bash
claude mcp add cse-mcp -- npx cse-mcp
```

#### Manual Configuration
Alternatively, add to your Claude configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac):

```json
{
  "mcpServers": {
    "cse": {
      "command": "npx",
      "args": ["cse-mcp"]
    }
  }
}
```

### Continue

Add to your Continue configuration (`~/.continue/config.json`):

```json
{
  "mcpServers": {
    "cse": {
      "command": "npx",
      "args": ["cse-mcp"]
    }
  }
}
```

### Other MCP Clients

Use the following command configuration:
- Command: `npx`
- Arguments: `["cse-mcp"]`

## Available Tools

### 1. search_company

Search for companies listed on the Colombo Stock Exchange.

**Input:**
- `query` (string): Company name or symbol to search

**Features:**
- Returns top 3 matches using fuzzy search
- Searches both symbol and company name
- Handles typos and partial matches

**Example:**
```json
{
  "query": "john keells"
}
```

**Response:**
```json
{
  "query": "john keells",
  "count": 3,
  "companies": [
    {
      "id": 297,
      "symbol": "JKH.N0000",
      "name": "JOHN KEELLS HOLDINGS PLC"
    },
    {
      "id": 596,
      "symbol": "JKL.N0000", 
      "name": "JOHN KEELLS HOTELS PLC"
    },
    {
      "id": 556,
      "symbol": "JKPL.N0000",
      "name": "JOHN KEELLS PLC"
    }
  ],
  "note": "Top 3 matches using fuzzy search"
}
```

### 2. get_stock_data

Get real-time stock price data for a specific ticker symbol.

**Input:**
- `symbol` (string): Exact ticker symbol (e.g., "JKH.N0000")

**Features:**
- Validates symbol against company database
- Fetches real-time data from CSE API
- Returns price in Sri Lankan Rupees (Rs.)

**Example:**
```json
{
  "symbol": "JKH.N0000"
}
```

**Response:**
```json
{
  "symbol": "JKH.N0000",
  "companyName": "JOHN KEELLS HOLDINGS PLC",
  "price": "Rs. 22.20",
  "change": "-0.10",
  "changePercentage": "-0.45%",
  "lastUpdated": "2024-12-17T10:30:00.000Z"
}
```

## Development

### Prerequisites
- Node.js 16 or higher
- npm or yarn

### Setup
```bash
# Clone the repository
git clone https://github.com/Shaveen12/cse-mcp.git
cd cse-mcp

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development mode
npm run dev
```

### Project Structure
```
cse-mcp/
├── src/
│   └── index.ts        # Main server implementation
├── bin/
│   └── cse-mcp.js      # CLI entry point
├── dist/               # Compiled JavaScript (generated)
├── cse_companies.csv   # Company database
├── package.json
├── tsconfig.json
└── README.md
```

### Testing with MCP Inspector

You can test the server using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
# Install MCP Inspector
npm install -g @modelcontextprotocol/inspector

# Run the inspector with the server
mcp-inspector node dist/index.js
```

## API Rate Limits

The CSE API has the following considerations:
- No authentication required
- Reasonable rate limiting is recommended
- Timeout set to 10 seconds per request

## Data Source

Company data and real-time prices are sourced from the [Colombo Stock Exchange](https://www.cse.lk).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License - see the package.json file for details.

## Disclaimer

This tool is for informational purposes only. Stock market data may be delayed. Always verify data with official sources before making investment decisions.

## Support

For issues, questions, or suggestions, please open an issue on [GitHub](https://github.com/Shaveen12/cse-mcp/issues).

## Acknowledgments

- [Colombo Stock Exchange](https://www.cse.lk) for providing the data API
- [Model Context Protocol](https://github.com/modelcontextprotocol) for the MCP SDK