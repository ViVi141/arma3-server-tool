using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Arma3ServerTools.Core.Models
{
    public class BEServerCfgEntity
    {
        public BEServerCfgEntity(int maxNumber, int seconds)
        {
            MaxNumber = maxNumber;
            Seconds = seconds;
        }

        public BEServerCfgEntity()
        {
        }

        public int MaxNumber { get; set; }
        public int Seconds { get; set; }
    }
}
