using System.IO;
using System.Text;
using Microsoft.Data.Sqlite;

namespace Arma3ServerTools.Application.IO
{
    internal static class SqliteScriptExecutor
    {
        public static void ExecuteScript(SqliteConnection connection, string script)
        {
            using (var reader = new StringReader(script))
            {
                string line;
                var statement = new StringBuilder();
                while ((line = reader.ReadLine()) != null)
                {
                    string trimmed = line.Trim();
                    if (trimmed.Length == 0 || trimmed.StartsWith("--"))
                    {
                        continue;
                    }

                    statement.AppendLine(line);
                    if (trimmed.EndsWith(";"))
                    {
                        ExecuteStatement(connection, statement.ToString());
                        statement.Clear();
                    }
                }

                if (statement.Length > 0)
                {
                    ExecuteStatement(connection, statement.ToString());
                }
            }
        }

        private static void ExecuteStatement(SqliteConnection connection, string sql)
        {
            string trimmed = sql.Trim();
            if (trimmed.Length == 0)
            {
                return;
            }

            using (SqliteCommand command = connection.CreateCommand())
            {
                command.CommandText = trimmed;
                command.ExecuteNonQuery();
            }
        }
    }
}
