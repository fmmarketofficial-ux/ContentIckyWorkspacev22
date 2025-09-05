# Bot Panel Privado - Discord Bot

## Overview

This is a Discord bot designed for managing and distributing gaming accounts (FiveM, Discord, Steam) through an interactive panel system. The bot provides automated account management with features like OTP retrieval, 2FA handling, ban management, and pack distribution. It integrates with Google Sheets for data storage and webmail services for OTP extraction, making it a comprehensive solution for gaming account administration.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Bot Framework
- **Discord.js v14**: Core Discord bot framework with slash commands and interactive components
- **Node.js Application**: Event-driven architecture with modular command and event handling
- **Environment Configuration**: Uses Replit Secrets for secure credential management

### Command System
- **Slash Commands**: Modern Discord interaction system with `/login`, `/setup`, and `/verificar_fila` commands
- **Modal Interactions**: Secure authentication through Discord modals
- **Button Components**: Interactive panel with action buttons for account requests and management

### Data Management
- **Google Sheets Integration**: Primary data storage using Google Sheets API v4
- **Account Categories**: Separate sheets for FiveM, Discord, and Steam accounts
- **Status Tracking**: Real-time account availability and ban status monitoring
- **Pack System**: Bundle distribution of complete account sets

### Authentication & Security
- **Code-based Authentication**: Users authenticate with access codes before using the bot
- **Owner-only Commands**: Administrative functions restricted to bot owner
- **Request Cooldowns**: Prevents spam and abuse with user-specific cooldowns
- **Active Request Tracking**: Prevents concurrent requests from same user

### Account Management Features
- **Automated OTP Retrieval**: Direct webmail integration for Rockstar Games OTP codes
- **2FA Token Handling**: Discord 2FA token management and display
- **Ban Management**: Server-specific ban tracking and enforcement
- **Account Release**: Return accounts to available pool
- **Bulk Account Addition**: Mass import functionality through file uploads

### Panel System
- **Interactive Dashboard**: Real-time statistics display with category breakdown
- **Auto-updating Interface**: Scheduled updates every minute
- **Visual Status Indicators**: Custom emojis for different account states and actions
- **Persistent Panel**: Single message interface that updates in-place

### External Integrations
- **Webmail Access**: IMAP connection to mail.30kbatch.com for OTP extraction
- **Google Workspace**: Service account authentication for Sheets API access
- **Logging System**: Dedicated channel logging for audit trail

## External Dependencies

### Core Libraries
- **discord.js**: Discord API wrapper and bot framework
- **googleapis**: Google Sheets API client library
- **imap-simple**: Email server connection for OTP retrieval
- **express**: Web server framework (for potential web interface)

### Utility Libraries
- **axios & axios-cookiejar-support**: HTTP client with cookie handling
- **cheerio**: HTML parsing for web scraping capabilities
- **tough-cookie**: Cookie management for web requests

### Google Services
- **Google Sheets API**: Account data storage and management
- **Service Account Authentication**: Secure API access without user interaction

### Email Services
- **IMAP Protocol**: Direct email server access for OTP extraction
- **Custom Mail Server**: mail.30kbatch.com integration for account emails

### Discord Platform
- **Discord Gateway**: Real-time bot connection with specific intents for guilds and DMs
- **Discord REST API**: Command registration and management
- **Discord Interactions**: Button, modal, and slash command handling