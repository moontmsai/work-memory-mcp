import fs from 'fs';
import path from 'path';
import { DatabaseConnection } from '../connection.js';

interface LegacySettings {
  version: string;
  max_memories: number;
  auto_cleanup_days: number;
  max_keywords_per_memory: number;
  enable_history: boolean;
  enable_auto_archive: boolean;
  search: {
    exact_match_score: number;
    partial_match_score: number;
    tag_match_score: number;
    max_results: number;
  };
  [key: string]: any; // 추가 설정을 위한 인덱스 시그니처
}

interface SettingMapping {
  legacyKey: string;
  newKey: string;
  valueType: 'string' | 'number' | 'boolean' | 'json';
  description: string;
  transform?: (value: any) => string;
}

export class SettingsMigrator {
  private connection: DatabaseConnection;
  private workMemoryPath: string;

  // 설정 매핑 정의
  private settingMappings: SettingMapping[] = [
    {
      legacyKey: 'version',
      newKey: 'legacy_version',
      valueType: 'string',
      description: 'Legacy settings file version'
    },
    {
      legacyKey: 'max_memories',
      newKey: 'max_memories_per_project',
      valueType: 'number',
      description: 'Maximum memories per project'
    },
    {
      legacyKey: 'auto_cleanup_days',
      newKey: 'cleanup_interval_days',
      valueType: 'number',
      description: 'Days before cleanup old memories'
    },
    {
      legacyKey: 'max_keywords_per_memory',
      newKey: 'max_keywords_per_memory',
      valueType: 'number',
      description: 'Maximum keywords per memory'
    },
    {
      legacyKey: 'enable_history',
      newKey: 'enable_history',
      valueType: 'boolean',
      description: 'Enable change history tracking'
    },
    {
      legacyKey: 'enable_auto_archive',
      newKey: 'enable_auto_archive',
      valueType: 'boolean',
      description: 'Enable automatic archiving'
    },
    {
      legacyKey: 'search.exact_match_score',
      newKey: 'search_exact_match_score',
      valueType: 'number',
      description: 'Score for exact keyword matches'
    },
    {
      legacyKey: 'search.partial_match_score',
      newKey: 'search_partial_match_score',
      valueType: 'number',
      description: 'Score for partial keyword matches'
    },
    {
      legacyKey: 'search.tag_match_score',
      newKey: 'search_tag_match_score',
      valueType: 'number',
      description: 'Score for tag matches'
    },
    {
      legacyKey: 'search.max_results',
      newKey: 'search_max_results',
      valueType: 'number',
      description: 'Maximum search results to return'
    }
  ];

  constructor(connection: DatabaseConnection, workMemoryPath: string = 'work_memory') {
    this.connection = connection;
    this.workMemoryPath = workMemoryPath;
  }

  /**
   * settings.json 파일을 system_settings 테이블로 마이그레이션
   */
  async migrate(): Promise<{ success: boolean; migratedSettings: number; errors: string[] }> {
    const errors: string[] = [];
    let migratedSettings = 0;

    try {
      // settings.json 파일 경로
      const settingsPath = path.join(this.workMemoryPath, 'settings.json');

      // 파일 존재 여부 확인
      if (!fs.existsSync(settingsPath)) {
        return { success: true, migratedSettings: 0, errors: [] };
      }

      // 기존 데이터 읽기
      const rawData = fs.readFileSync(settingsPath, 'utf-8');
      const legacySettings: LegacySettings = JSON.parse(rawData);

      // 트랜잭션 시작
      await this.connection.run('BEGIN TRANSACTION');

      try {
        // 각 설정 매핑에 따라 마이그레이션
        for (const mapping of this.settingMappings) {
          try {
            const value = this.getNestedValue(legacySettings, mapping.legacyKey);
            
            if (value !== undefined && value !== null) {
              await this.migrateSetting(mapping, value);
              migratedSettings++;
            }
          } catch (error) {
            const errorMsg = `Failed to migrate setting ${mapping.legacyKey}: ${error instanceof Error ? error.message : String(error)}`;
            errors.push(errorMsg);
          }
        }

        // 전체 설정을 JSON으로도 저장 (백업 목적)
        await this.connection.run(`
          INSERT OR REPLACE INTO system_settings (key, value, value_type, description)
          VALUES (?, ?, ?, ?)
        `, [
          'legacy_settings_backup',
          JSON.stringify(legacySettings),
          'json',
          'Complete backup of legacy settings.json file'
        ]);
        migratedSettings++;

        // 트랜잭션 커밋
        await this.connection.run('COMMIT');

        // 백업 생성
        await this.createBackup(settingsPath);

        return { success: true, migratedSettings, errors };

      } catch (error) {
        // 트랜잭션 롤백
        await this.connection.run('ROLLBACK');
        throw error;
      }

    } catch (error) {
      const errorMsg = `Settings migration failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      return { success: false, migratedSettings, errors };
    }
  }

  /**
   * 개별 설정 마이그레이션
   */
  private async migrateSetting(mapping: SettingMapping, value: any): Promise<void> {
    // 값 변환
    const transformedValue = mapping.transform ? mapping.transform(value) : String(value);

    // 이미 존재하는 설정인지 확인
    const existing = await this.connection.get(
      'SELECT key FROM system_settings WHERE key = ?',
      [mapping.newKey]
    );

    if (existing) {
      // 기존 설정 업데이트
      await this.connection.run(`
        UPDATE system_settings 
        SET value = ?, value_type = ?, description = ?, updated_at = datetime('now')
        WHERE key = ?
      `, [transformedValue, mapping.valueType, mapping.description, mapping.newKey]);
      
    } else {
      // 새 설정 삽입
      await this.connection.run(`
        INSERT INTO system_settings (key, value, value_type, description)
        VALUES (?, ?, ?, ?)
      `, [mapping.newKey, transformedValue, mapping.valueType, mapping.description]);
      
    }
  }

  /**
   * 중첩된 객체에서 값 가져오기
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * 백업 생성
   */
  private async createBackup(originalPath: string): Promise<void> {
    try {
      const backupPath = `${originalPath}.backup.${Date.now()}`;
      fs.copyFileSync(originalPath, backupPath);
    } catch (error) {
      // Silently ignore backup creation failures
    }
  }

  /**
   * 마이그레이션 검증
   */
  async verify(): Promise<{ isValid: boolean; issues: string[] }> {
    const issues: string[] = [];

    try {
      // 원본 파일 확인
      const settingsPath = path.join(this.workMemoryPath, 'settings.json');
      
      if (!fs.existsSync(settingsPath)) {
        return { isValid: true, issues: [] };
      }

      const rawData = fs.readFileSync(settingsPath, 'utf-8');
      const legacySettings: LegacySettings = JSON.parse(rawData);

      // 각 매핑된 설정이 데이터베이스에 존재하는지 확인
      for (const mapping of this.settingMappings) {
        const legacyValue = this.getNestedValue(legacySettings, mapping.legacyKey);
        
        if (legacyValue !== undefined && legacyValue !== null) {
          const dbSetting = await this.connection.get(
            'SELECT value, value_type FROM system_settings WHERE key = ?',
            [mapping.newKey]
          );

          if (!dbSetting) {
            issues.push(`Setting ${mapping.newKey} not found in database`);
          } else {
            // 값 타입 확인
            if (dbSetting.value_type !== mapping.valueType) {
              issues.push(`Setting ${mapping.newKey} has wrong type: expected ${mapping.valueType}, got ${dbSetting.value_type}`);
            }

            // 값 일치 확인 (타입에 따라)
            const expectedValue = String(legacyValue);
            if (dbSetting.value !== expectedValue) {
              issues.push(`Setting ${mapping.newKey} value mismatch: expected ${expectedValue}, got ${dbSetting.value}`);
            }
          }
        }
      }

      // 백업 설정 확인
      const backupSetting = await this.connection.get(
        'SELECT value FROM system_settings WHERE key = ?',
        ['legacy_settings_backup']
      );

      if (!backupSetting) {
        issues.push('Legacy settings backup not found in database');
      } else {
        try {
          const backupData = JSON.parse(backupSetting.value);
          // 기본적인 구조 확인
          if (!backupData.version || !backupData.search) {
            issues.push('Legacy settings backup appears to be incomplete');
          }
        } catch (error) {
          issues.push('Legacy settings backup is not valid JSON');
        }
      }

      return { isValid: issues.length === 0, issues };

    } catch (error) {
      issues.push(`Verification failed: ${error instanceof Error ? error.message : String(error)}`);
      return { isValid: false, issues };
    }
  }

  /**
   * 설정 값 타입 변환 및 검증
   */
  private validateAndConvertValue(value: any, expectedType: string): string {
    switch (expectedType) {
      case 'boolean':
        if (typeof value === 'boolean') {
          return String(value);
        }
        throw new Error(`Expected boolean, got ${typeof value}`);
      
      case 'number':
        if (typeof value === 'number') {
          return String(value);
        }
        throw new Error(`Expected number, got ${typeof value}`);
      
      case 'string':
        return String(value);
      
      case 'json':
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return String(value);
      
      default:
        return String(value);
    }
  }

  /**
   * 현재 시스템 설정과 레거시 설정 비교
   */
  async compareSettings(): Promise<{ matches: number; mismatches: string[]; missing: string[] }> {
    const mismatches: string[] = [];
    const missing: string[] = [];
    let matches = 0;

    try {
      // 원본 파일 읽기
      const settingsPath = path.join(this.workMemoryPath, 'settings.json');
      
      if (!fs.existsSync(settingsPath)) {
        return { matches: 0, mismatches: ['settings.json file not found'], missing: [] };
      }

      const rawData = fs.readFileSync(settingsPath, 'utf-8');
      const legacySettings: LegacySettings = JSON.parse(rawData);

      // 각 매핑 확인
      for (const mapping of this.settingMappings) {
        const legacyValue = this.getNestedValue(legacySettings, mapping.legacyKey);
        
        if (legacyValue === undefined || legacyValue === null) {
          missing.push(`Legacy setting ${mapping.legacyKey} not found`);
          continue;
        }

        const dbSetting = await this.connection.get(
          'SELECT value FROM system_settings WHERE key = ?',
          [mapping.newKey]
        );

        if (!dbSetting) {
          missing.push(`Database setting ${mapping.newKey} not found`);
          continue;
        }

        const expectedValue = String(legacyValue);
        if (dbSetting.value === expectedValue) {
          matches++;
        } else {
          mismatches.push(`${mapping.newKey}: expected "${expectedValue}", got "${dbSetting.value}"`);
        }
      }

      return { matches, mismatches, missing };

    } catch (error) {
      return { 
        matches: 0, 
        mismatches: [`Comparison failed: ${error instanceof Error ? error.message : String(error)}`], 
        missing: [] 
      };
    }
  }
} 