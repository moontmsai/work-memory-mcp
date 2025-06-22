const ts = require('typescript');
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');
const tsconfigPath = path.join(projectRoot, 'tsconfig.json');

// 1. Clean the dist directory
const distPath = path.join(projectRoot, 'dist');
if (fs.existsSync(distPath)) {
    console.log('Cleaning dist directory...');
    fs.rmSync(distPath, { recursive: true, force: true });
}

// 2. Parse tsconfig and compile
const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
if (configFile.error) {
    console.error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\\n'));
    process.exit(1);
}

const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsconfigPath));
if (parsedConfig.errors.length > 0) {
    parsedConfig.errors.forEach(diag => {
        console.error(ts.flattenDiagnosticMessageText(diag.messageText, '\\n'));
    });
    process.exit(1);
}

const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
const emitResult = program.emit();

const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

allDiagnostics.forEach(diagnostic => {
    if (diagnostic.file) {
        const { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start);
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\\n');
        console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
    } else {
        console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\\n'));
    }
});

if (emitResult.emitSkipped) {
    console.log('Build failed.');
    process.exit(1);
} else {
    console.log('Build completed successfully.');
} 