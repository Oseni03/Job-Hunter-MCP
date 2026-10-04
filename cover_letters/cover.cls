% Minimal cover.cls - local stand-in so cover_letters/cover_*.tex compile with xelatex.
% Provides the commands used by 06-cover-letter-templates.md:
% \namesection, \currentdate, \lettercontent, \closing, \signature.
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{cover}[2026/10/04 Minimal cover letter class]

\LoadClass[11pt,a4paper]{article}

\RequirePackage{fontspec}
\RequirePackage{hyperref}
\RequirePackage{geometry}
\geometry{margin=2.5cm}
\RequirePackage{parskip}

% Header: \namesection{first}{NAME}{contact line}
\newcommand{\namesection}[3]{%
  \begin{center}%
    {\Huge #2}\par\vspace{4pt}%
    {\small #3}\par\vspace{8pt}%
  \end{center}%
}

% Date line
\newcommand{\currentdate}[1]{%
  \begin{flushright}#1\end{flushright}\vspace{6pt}%
}

% Body paragraph. No trailing \\ by design, so an itemize list must stay
% OUTSIDE \lettercontent (see 06-cover-letter-templates.md pitfall).
\newcommand{\lettercontent}[1]{#1\par\vspace{6pt}}

% Closing appends its own line break, so callers pass no trailing \\.
\newcommand{\closing}[1]{#1\\}
\newcommand{\signature}[1]{\textbf{#1}}
