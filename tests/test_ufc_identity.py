import ast, html, re, unicodedata, unittest
from pathlib import Path
source=Path(__file__).resolve().parents[1]/'scripts/update_kalshi_ufc.py'
namespace={'html':html,'re':re,'unicodedata':unicodedata}
names={'fighter_key','search_profile_link','fight_result'}
exec(compile(ast.Module(body=[n for n in ast.parse(source.read_text()).body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),str(source),'exec'),namespace)
class FighterIdentityTests(unittest.TestCase):
 def test_search_does_not_take_first_similar_name(self):
  def row(first,last,url):return f'<tr><td><a href="{url}">{first}</a></td><td><a href="{url}">{last}</a></td></tr>'
  wrong='http://ufcstats.com/fighter-details/wrong';right='https://ufcstats.com/fighter-details/right'
  page=row('Jose','Other',wrong)+row('José','Aldo',right)
  self.assertEqual(namespace['search_profile_link'](page,'Jose Aldo'),right)
  self.assertIsNone(namespace['search_profile_link'](page,'Jose Unknown'))
  self.assertIsNone(namespace['search_profile_link'](page+row('Jose','Aldo',wrong),'Jose Aldo'))
 def test_result_belongs_to_selected_fighter(self):
  def person(name,result):return f'<i class="b-fight-details__person-status">{result}</i><h3 class="b-fight-details__person-name"><a href="profile">{name}</a></h3>'
  page=person('Winner One','W')+person('Fighter Two','L')
  self.assertEqual(namespace['fight_result'](page,'Fighter Two'),'L')
  self.assertEqual(namespace['fight_result'](page,'Winner One'),'W')
  self.assertIsNone(namespace['fight_result'](page,'Unknown'))
